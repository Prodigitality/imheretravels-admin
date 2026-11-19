import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { addWorkingDays, parseDecision, planApproval } from "@/lib/account-claims-logic";
import {
  CLAIM_STATES,
  type AccountClaim,
  type ClaimBooking,
  type ClaimHistoryEntry,
  type ClaimState,
  type ConflictType,
} from "@/types/account-claims";

/**
 * Staff side of customer-portal Needs Review cases (portal docs/02, 05 P2).
 *
 * The collections below are written by the portal and denied to every
 * browser by firestore.rules, so all access goes through firebase-admin here,
 * behind requireStaff. Linking follows the portal's invariant: at most one
 * active link per traveller record, enforced on bookingLinkGuards/{bookingId}
 * inside the same transaction as the link, the claim update and the audit log.
 */
const COL = {
  claims: "accountClaims",
  accounts: "customerAccounts",
  profiles: "customerProfiles",
  links: "bookingAccountLinks",
  guards: "bookingLinkGuards",
  audit: "auditLogs",
  bookings: "bookings",
} as const;
const DISMISSED = "dismissedCandidates";
const SLA_WORKING_DAYS = 2;
const MAX_CLAIMS = 500;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function iso(v: unknown): string | null {
  if (v && typeof (v as Timestamp).toDate === "function") return (v as Timestamp).toDate().toISOString();
  return typeof v === "string" && v ? v : null;
}

/** Booking dates are Timestamps, ISO strings or DD/MM/YYYY in older rows. */
function isoDay(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
  }
  const at = iso(v);
  return at ? at.slice(0, 10) : null;
}

const hashRef = (ref: string) => createHash("sha256").update(ref.trim().toUpperCase()).digest("hex");

function writeAudit(
  tx: Transaction,
  db: Firestore,
  e: { actorId: string; action: string; targetType: string; targetId: string; reasonCode?: string; correlationId: string },
) {
  tx.create(db.collection(COL.audit).doc(), { actorType: "staff", ...e, createdAt: FieldValue.serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type People = Map<string, { email: string; name: string; createdAt: string | null; verifiedAt: string | null }>;

async function loadPeople(db: Firestore, userIds: string[]): Promise<People> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out: People = new Map();
  if (!ids.length) return out;
  const [accounts, profiles] = await Promise.all([
    db.getAll(...ids.map((id) => db.collection(COL.accounts).doc(id))),
    db.getAll(...ids.map((id) => db.collection(COL.profiles).doc(id))),
  ]);
  ids.forEach((id, i) => {
    const a = accounts[i];
    const p = profiles[i];
    out.set(id, {
      email: str(a?.get("primaryEmailNormalised")),
      name: [str(p?.get("firstName")), str(p?.get("lastName"))].filter(Boolean).join(" "),
      createdAt: iso(a?.get("createdAt")),
      verifiedAt: iso(a?.get("emailVerifiedAt")),
    });
  });
  return out;
}

function bookingView(
  booking: DocumentSnapshot,
  guard: DocumentSnapshot | undefined,
  claimantUserId: string,
  people: People,
): ClaimBooking {
  const d = booking.data() ?? {};
  const active = guard?.exists && guard.get("status") === "active";
  const holderId = active ? str(guard!.get("userId")) : "";
  const holder = holderId ? people.get(holderId) : undefined;
  return {
    documentId: booking.id,
    ref: str(d.bookingId),
    tourName: str(d.tourPackageName),
    tourDate: isoDay(d.tourDate),
    travellerName: str(d.fullName) || [str(d.firstName), str(d.lastName)].filter(Boolean).join(" "),
    email: str(d.emailAddress),
    isMainBooker: d.isMainBooker === true,
    bookingType: str(d.bookingType),
    holder: holderId
      ? {
          isClaimant: holderId === claimantUserId,
          email: holder?.email || "(account not found)",
          name: holder?.name ?? "",
          linkedAt: iso(guard!.get("updatedAt")),
        }
      : null,
  };
}

function historyOf(d: FirebaseFirestore.DocumentData): ClaimHistoryEntry[] {
  const raw = Array.isArray(d.history) ? d.history : [];
  return raw.map((h: Record<string, unknown>) => ({
    action: h.action as ClaimHistoryEntry["action"],
    reasonCode: str(h.reasonCode),
    note: str(h.note),
    byName: str(h.byName) || "Staff",
    at: iso(h.at),
    emailed: h.emailed === true,
  }));
}

/** Every claim, newest first, with the customer, the booking and who holds it now. */
export async function listClaims(): Promise<{ claims: AccountClaim[]; truncated: boolean }> {
  const db = adminDb();
  const snap = await db.collection(COL.claims).orderBy("submittedAt", "desc").limit(MAX_CLAIMS).get();
  const docs = snap.docs;

  const bookingIds = [...new Set(docs.map((d) => str(d.get("bookingDocumentId"))).filter(Boolean))];
  const [bookings, guards] = bookingIds.length
    ? await Promise.all([
        db.getAll(...bookingIds.map((id) => db.collection(COL.bookings).doc(id))),
        db.getAll(...bookingIds.map((id) => db.collection(COL.guards).doc(id))),
      ])
    : [[], []];
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const guardById = new Map(guards.map((g) => [g.id, g]));
  const holderIds = guards.filter((g) => g.exists && g.get("status") === "active").map((g) => str(g.get("userId")));
  const people = await loadPeople(db, [...docs.map((d) => str(d.get("userId"))), ...holderIds]);

  const now = Date.now();
  const claims = docs.map((doc): AccountClaim => {
    const d = doc.data();
    const userId = str(d.userId);
    const state: ClaimState = CLAIM_STATES.includes(d.state) ? d.state : "open";
    const submittedAt = iso(d.submittedAt);
    const dueAt = submittedAt ? addWorkingDays(new Date(submittedAt), SLA_WORKING_DAYS).toISOString() : null;
    const bookingId = str(d.bookingDocumentId);
    const booking = bookingId ? bookingById.get(bookingId) : undefined;
    const person = people.get(userId);
    return {
      id: doc.id,
      conflictType: (d.conflictType as ConflictType) ?? "ambiguous",
      state,
      submittedAt,
      resolvedAt: iso(d.resolvedAt),
      dueAt,
      overdue: (state === "open" || state === "needs_evidence") && !!dueAt && Date.parse(dueAt) < now,
      reasonCode: str(d.reasonCode) || null,
      riskFlags: Array.isArray(d.riskFlags) ? d.riskFlags.filter((x: unknown) => typeof x === "string") : [],
      customerMessage: str(d.evidence?.customerDetails),
      customer: {
        userId,
        email: person?.email ?? "",
        name: person?.name ?? "",
        accountCreatedAt: person?.createdAt ?? null,
        emailVerifiedAt: person?.verifiedAt ?? null,
      },
      booking: booking?.exists ? bookingView(booking, guardById.get(bookingId), userId, people) : null,
      history: historyOf(d),
      emailFailures: (Array.isArray(d.emailFailures) ? d.emailFailures : []).map((f: Record<string, unknown>) => ({
        kinds: Array.isArray(f.kinds) ? f.kinds.filter((k): k is string => typeof k === "string") : [],
        at: iso(f.at),
      })),
    };
  });
  return { claims, truncated: docs.length >= MAX_CLAIMS };
}

/**
 * Manual checks: find the booking the customer described, by booking
 * reference or by the email it was made with. Exact matches only.
 */
export async function searchBookings(query: string, claimantUserId: string): Promise<ClaimBooking[]> {
  const q = query.trim();
  if (q.length < 3 || q.length > 120) return [];
  const db = adminDb();
  const bookings = db.collection(COL.bookings);
  const queries = q.includes("@")
    ? [bookings.where("emailAddress", "==", q), bookings.where("emailAddress", "==", q.toLowerCase()), bookings.where("emailAddressNormalised", "==", q.toLowerCase())]
    : [bookings.where("bookingId", "==", q.toUpperCase()), bookings.where("bookingId", "==", q)];
  const found = new Map<string, DocumentSnapshot>();
  for (const s of await Promise.all(queries.map((x) => x.limit(25).get()))) for (const d of s.docs) found.set(d.id, d);
  const docs = [...found.values()].slice(0, 25);
  if (!docs.length) return [];
  const guards = await db.getAll(...docs.map((d) => db.collection(COL.guards).doc(d.id)));
  const people = await loadPeople(
    db,
    guards.filter((g) => g.exists && g.get("status") === "active").map((g) => str(g.get("userId"))),
  );
  return docs.map((d, i) => bookingView(d, guards[i], claimantUserId, people));
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

type Email = { to: string; kind: "approved" | "rejected" | "needs_evidence" | "booking_address" | "previous_holder"; ref: string; tour: string };

export type DecisionResult =
  | { ok: true; state: ClaimState; emails: { kind: Email["kind"]; sent: boolean }[] }
  | { ok: false; status: number; error: string };

export async function decideClaim(
  claimId: string,
  body: unknown,
  staff: { uid: string; name: string },
): Promise<DecisionResult> {
  const db = adminDb();
  const claimRef = db.collection(COL.claims).doc(claimId);
  const correlationId = randomUUID();

  const outcome = await db.runTransaction(async (tx): Promise<DecisionResult | { ok: true; state: ClaimState; emails: Email[] }> => {
    // All reads first (Firestore transactions require it).
    const claim = await tx.get(claimRef);
    if (!claim.exists) return { ok: false, status: 404, error: "Case not found" };
    const c = claim.data()!;
    const userId = str(c.userId);
    const parsed = parseDecision(body, {
      state: CLAIM_STATES.includes(c.state) ? c.state : "open",
      conflictType: c.conflictType,
      bookingDocumentId: str(c.bookingDocumentId) || null,
    });
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
    const input = parsed.value;

    const account = await tx.get(db.collection(COL.accounts).doc(userId));
    const customerEmail = str(account.get("primaryEmailNormalised"));
    const emails: Email[] = [];
    const update: Record<string, unknown> = {
      reasonCode: input.reasonCode,
      reviewedBy: staff.uid,
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({
        action: input.action,
        reasonCode: input.reasonCode,
        note: input.note,
        by: staff.uid,
        byName: staff.name,
        at: Timestamp.now(),
        emailed: input.emailCustomer && !!customerEmail,
      }),
    };

    if (input.action === "approve") {
      const bookingId = input.bookingDocumentId!;
      const bookingRef = db.collection(COL.bookings).doc(bookingId);
      const guardRef = db.collection(COL.guards).doc(bookingId);
      const [booking, guard] = await tx.getAll(bookingRef, guardRef);
      if (!booking.exists) return { ok: false, status: 404, error: "That booking no longer exists" };
      const plan = planApproval(
        guard.exists ? (guard.data() as { userId?: string; linkId?: string; status?: string }) : null,
        userId,
        input.revokeExisting === true,
      );
      if (plan.kind === "error") return { ok: false, status: 409, error: plan.error };
      const previousAccount =
        plan.kind === "revoke_and_link" ? await tx.get(db.collection(COL.accounts).doc(plan.previousUserId)) : null;

      const ref = str(booking.get("bookingId"));
      const tour = str(booking.get("tourPackageName"));

      if (plan.kind === "revoke_and_link") {
        tx.update(db.collection(COL.links).doc(plan.previousLinkId), {
          status: "revoked",
          revokedAt: FieldValue.serverTimestamp(),
          revokedBy: staff.uid,
          revokeReason: `claim:${claimId}`,
        });
        writeAudit(tx, db, {
          actorId: staff.uid,
          action: "booking.link_revoked",
          targetType: "bookingAccountLink",
          targetId: plan.previousLinkId,
          reasonCode: input.reasonCode,
          correlationId,
        });
        const prevEmail = str(previousAccount?.get("primaryEmailNormalised"));
        if (prevEmail) emails.push({ to: prevEmail, kind: "previous_holder", ref, tour });
      }

      if (plan.kind !== "already_linked") {
        const linkRef = db.collection(COL.links).doc();
        tx.create(linkRef, {
          userId,
          bookingDocumentId: bookingId,
          status: "active",
          source: "staff",
          evidenceType: "staff_review",
          confirmedAt: FieldValue.serverTimestamp(),
          reviewCaseId: claimId,
          riskFlags: [],
          createdBy: staff.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(guardRef, { userId, linkId: linkRef.id, status: "active", updatedAt: FieldValue.serverTimestamp() });
        tx.delete(db.collection(COL.accounts).doc(userId).collection(DISMISSED).doc(bookingId));
        writeAudit(tx, db, {
          actorId: staff.uid,
          action: "booking.linked",
          targetType: "bookingAccountLink",
          targetId: linkRef.id,
          reasonCode: "staff",
          correlationId,
        });
        // 05 P9: every new link tells the booking's own address.
        const bookingEmail = str(booking.get("emailAddress")).toLowerCase();
        if (bookingEmail && bookingEmail !== customerEmail) emails.push({ to: bookingEmail, kind: "booking_address", ref, tour });
      }

      Object.assign(update, {
        state: "approved",
        resolvedAt: FieldValue.serverTimestamp(),
        bookingDocumentId: bookingId,
        publicBookingReferenceHash: ref ? hashRef(ref) : null,
      });
      if (input.emailCustomer && customerEmail) emails.push({ to: customerEmail, kind: "approved", ref, tour });
    } else {
      const bookingId = str(c.bookingDocumentId);
      const booking = bookingId ? await tx.get(db.collection(COL.bookings).doc(bookingId)) : null;
      const ref = str(booking?.get("bookingId"));
      const tour = str(booking?.get("tourPackageName"));
      if (input.action === "reject") {
        update.state = "rejected";
        update.resolvedAt = FieldValue.serverTimestamp();
      } else {
        update.state = "needs_evidence";
      }
      if (input.emailCustomer && customerEmail) {
        emails.push({ to: customerEmail, kind: input.action === "reject" ? "rejected" : "needs_evidence", ref, tour });
      }
    }

    tx.update(claimRef, update);
    writeAudit(tx, db, {
      actorId: staff.uid,
      action: `claim.${input.action === "needs_evidence" ? "evidence_requested" : input.action === "approve" ? "approved" : "rejected"}`,
      targetType: "accountClaim",
      targetId: claimId,
      reasonCode: input.reasonCode,
      correlationId,
    });
    return { ok: true, state: update.state as ClaimState, emails };
  });

  if (!outcome.ok) return outcome;
  const sent: { kind: Email["kind"]; sent: boolean }[] = [];
  for (const e of outcome.emails as Email[]) {
    const ok = await sendClaimEmail(e).then(
      () => true,
      (err) => {
        console.error("[account-claims] email failed", e.kind, correlationId, err);
        return false;
      },
    );
    sent.push({ kind: e.kind, sent: ok });
  }
  const failed = sent.filter((s) => !s.sent).map((s) => s.kind);
  if (failed.length) {
    // The decision stands; record the failure so the case shows staff must email by hand.
    await claimRef
      .update({ emailFailures: FieldValue.arrayUnion({ kinds: failed, at: Timestamp.now() }) })
      .catch((err) => console.error("[account-claims] could not record email failure", correlationId, err));
  }
  return { ok: true, state: outcome.state, emails: sent };
}

// ---------------------------------------------------------------------------
// Emails: same look and sender as the portal's account emails
// ---------------------------------------------------------------------------

const supportEmail = () => process.env.SUPPORT_EMAIL || "bella@imheretravels.com";
const fromAddress = () => process.env.ACCOUNT_EMAIL_FROM || `"I'm Here Travels" <accounts@imheretravels.com>`;

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function emailHtml(o: {
  heading: string;
  paragraphs: string[];
  list?: string[];
  after?: string[];
  cta?: { label: string; href: string };
  footnote?: string;
}) {
  const para = (t: string) => `<tr><td style="padding:12px 32px 0;font-size:16px;line-height:1.5">${escape(t)}</td></tr>`;
  const list = o.list?.length
    ? `<tr><td style="padding:8px 32px 0;font-size:16px;line-height:1.5"><ul style="margin:0;padding-left:20px">${o.list
        .map((t) => `<li>${escape(t)}</li>`)
        .join("")}</ul></td></tr>`
    : "";
  const p = o.paragraphs.map(para).join("") + list + (o.after ?? []).map(para).join("");
  const cta = o.cta
    ? `<tr><td style="padding:24px 32px 0"><a href="${escape(o.cta.href)}" style="display:inline-block;background:#ef3340;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px">${escape(o.cta.label)}</a></td></tr>`
    : "";
  const foot = o.footnote
    ? `<tr><td style="padding:20px 32px 0;font-size:13px;line-height:1.5;color:#6b7280">${escape(o.footnote)}</td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1c1f2a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px">
<tr><td style="padding:28px 32px 0;font-weight:700;font-size:14px;letter-spacing:.04em;color:#ef3340">I'M HERE TRAVELS</td></tr>
<tr><td style="padding:16px 32px 0;font-size:24px;font-weight:700">${escape(o.heading)}</td></tr>
${p}${cta}${foot}
<tr><td style="padding:24px 32px 28px;font-size:13px;line-height:1.5;color:#6b7280">Questions? Reply to this email or write to <a href="mailto:${escape(supportEmail())}" style="color:#1c1f2a">${escape(supportEmail())}</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Customer-facing copy. Never names or hints at another account. */
export function claimEmailContent(e: Pick<Email, "kind" | "ref" | "tour">): { subject: string; html: string } {
  const what = e.tour && e.ref ? `${e.tour} (${e.ref})` : e.ref || e.tour || "your booking";
  const portal = process.env.PORTAL_URL?.replace(/\/$/, "");
  const trips = portal ? { label: "View My Trips", href: `${portal}/portal/trips` } : undefined;
  switch (e.kind) {
    case "approved":
      return {
        subject: "We've added your booking to your account",
        html: emailHtml({
          heading: "Your booking is in your account",
          paragraphs: [`We checked your request and added ${what} to your I'm Here Travels account. You'll find it in My Trips.`],
          cta: trips,
        }),
      };
    case "needs_evidence":
      return {
        subject: "We need a little more to confirm your booking",
        html: emailHtml({
          heading: "Help us confirm your booking",
          paragraphs: ["Thanks for asking us to check a booking. To make sure it's yours, please reply to this email with:"],
          list: [
            "the booking reference",
            "your date of birth as it appears on the booking",
            "the email address used to pay, or your payment receipt",
          ],
          after: ["We'll add it to your account as soon as we've confirmed it."],
        }),
      };
    case "rejected":
      return {
        subject: "About the booking you asked us to check",
        html: emailHtml({
          heading: "We couldn't confirm this booking",
          paragraphs: [
            `We looked into your request about ${what}, but we couldn't confirm it belongs to you, so we haven't added it to your account.`,
            "If you think this is a mistake, reply to this email with your booking reference, your date of birth as it appears on the booking, and the email used to pay.",
          ],
        }),
      };
    case "booking_address":
      return {
        subject: e.ref ? `Booking ${e.ref} was added to an account` : "Your booking was added to an account",
        html: emailHtml({
          heading: "Your booking was added to an account",
          paragraphs: [`After a check by our team, ${what} has been added to an I'm Here Travels account.`],
          footnote: "If you asked for this, there's nothing else to do. If not, please reply to this email.",
        }),
      };
    case "previous_holder":
      return {
        subject: "A booking was removed from your account",
        html: emailHtml({
          heading: "A booking was removed from your account",
          paragraphs: [
            `After a review by our team, ${what} is no longer linked to your I'm Here Travels account. The booking itself hasn't changed.`,
            "If you think this is wrong, reply to this email and we'll look into it.",
          ],
        }),
      };
  }
}

async function sendClaimEmail(e: Email): Promise<void> {
  const { subject, html } = claimEmailContent(e);
  await new GmailApiService().sendEmail({ to: e.to, subject, htmlContent: html, from: fromAddress(), replyTo: supportEmail() });
}
