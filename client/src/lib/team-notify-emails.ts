import "server-only";

/**
 * Team emails for the two Black Friday moments the website can't see:
 *  - a slot hold (www sale page → /api/public/sale/claim)
 *  - a reservation fee paid (deposit), main booker or guest
 * They go to TEAM_NOTIFY_RECIPIENTS: bella@ follows up, jay@ (WaveX, the ad
 * agency) checks what Meta reports against what actually comes in. Each
 * shows the visit's UTMs. Tour enquiries and contact messages are emailed by
 * the website itself (www lib/lead-emails.ts), in the same branded layout.
 *
 * Best effort: a failed email never fails the hold or the booking.
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { UTM_KEYS, type Utm } from "@/lib/utm";
import type { SaleHoldView } from "@/types/sale-events";

/** Keep in step with www lib/lead-recipients.ts. */
export const TEAM_NOTIFY_RECIPIENTS = ["bella@imheretravels.com", "jay@imheretravels.com"] as const;
const SENDER = "IHT Website <bella@imheretravels.com>";
const ADMIN_BASE_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL || "https://admin.imheretravels.com";
const SITE_URL = "https://www.imheretravels.com";
const LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/imheretravels-a3f81.firebasestorage.app/o/website-assets%2Fbd35684dc8836c690d9d6b4bc9e112b3eb54301a4109bc36e7eb06571c66a0c1.png?alt=media&token=2ec27c63-b0cc-444e-b8d9-579b615855c6";

// ---------------------------------------------------------------------------
// Layout (same look as the website's emails, www lib/email-layout.ts)
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rowsTable(rows: [string, string][]): string {
  const body = rows
    .map(([label, value]) => {
      const safe = escapeHtml(value).replace(/\n/g, "<br/>");
      const isEmail = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value);
      const cell = isEmail ? `<a href="mailto:${escapeHtml(value)}" style="color:#EF3340;">${safe}</a>` : safe;
      return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #F2F0EE;vertical-align:top;width:38%;color:#505050;font-size:13px;">${escapeHtml(label)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #F2F0EE;vertical-align:top;color:#1C1F2A;font-size:14px;">${cell}</td>
</tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #F2F0EE;">
${body}
</table>`;
}

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F2F0EE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F0EE;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;font-family:Arial,Helvetica,sans-serif;color:#1C1F2A;">
<tr><td style="padding:28px 32px 8px 32px;"><img src="${LOGO_URL}" alt="I'm Here Travels" width="160" style="display:block;border:0;height:auto;"/></td></tr>
<tr><td style="padding:8px 32px 32px 32px;font-size:15px;line-height:1.6;">${inner}</td></tr>
</table>
</td></tr></table></body></html>`;
}

const eyebrow = (t: string) =>
  `<p style="margin:0 0 4px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#EF3340;font-weight:bold;">${escapeHtml(t)}</p>`;
const darkButton = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:#1C1F2A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;">${escapeHtml(label)}</a>`;

/** The UTM block shared by both emails. */
export function campaignHtml(utm: Utm | null | undefined): string {
  const rows = utm ? (UTM_KEYS.filter((k) => utm[k]).map((k) => [k, utm[k] as string]) as [string, string][]) : [];
  return rows.length
    ? `<p style="margin:24px 0 8px 0;font-weight:bold;">Campaign (UTM)</p>${rowsTable(rows)}`
    : `<p style="margin:24px 0 0 0;font-size:13px;color:#505050;">Campaign (UTM): none (not from a tagged ad or link).</p>`;
}

const gbp = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

const ukTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** A travel date (Timestamp, {_seconds}/{seconds}, ISO string) as "1 Dec 2026". */
export function travelDateLabel(v: unknown): string {
  if (v == null || v === "") return "";
  const t = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
  const ms =
    typeof t.toDate === "function"
      ? t.toDate().getTime()
      : typeof t.seconds === "number"
        ? t.seconds * 1000
        : typeof t._seconds === "number"
          ? t._seconds * 1000
          : typeof v === "string" || typeof v === "number"
            ? new Date(v).getTime()
            : NaN;
  return Number.isFinite(ms) ? dayLabel.format(ms) : "";
}

async function send(to: readonly string[], subject: string, html: string, replyTo?: string) {
  await new GmailApiService().sendEmail({ to: to.join(", "), subject, htmlContent: html, from: SENDER, replyTo });
}

// ---------------------------------------------------------------------------
// Slot hold
// ---------------------------------------------------------------------------

export function buildHoldEmail(hold: SaleHoldView, holderEmail: string, utm: Utm | null | undefined) {
  const people = `${hold.partySize} ${hold.partySize === 1 ? "person" : "people"}`;
  const prices = hold.slots.map((s) => s.salePrice).filter((n) => Number.isFinite(n));
  const fromPrice = prices.length ? Math.min(...prices) : null;
  const until = ukTime.format(Date.parse(hold.displayExpiresAt));
  const trackerUrl = `${ADMIN_BASE_URL}/tours/sales/${encodeURIComponent(hold.saleId)}/edit`;
  const subject = `Slot hold: ${hold.tourName} · ${people}`;
  const rows: [string, string][] = [
    ["Tour", hold.tourName],
    ["Sale", hold.saleName],
    ["Slots held", `${people} (slot ${hold.slots.map((s) => s.index).join(", ")})`],
    ...(fromPrice !== null ? ([["Sale price", `from ${gbp(fromPrice)} per person`]] as [string, string][]) : []),
    ["Customer email", holderEmail],
    ["Held until", `${until} (UK time)`],
    ["Hold ID", hold.holdId],
  ];
  const html = shell(`
${eyebrow("New slot hold")}
<h1 style="margin:0 0 16px 0;font-size:22px;">${escapeHtml(hold.tourName)} · ${escapeHtml(people)}</h1>
<p style="margin:0 0 16px 0;">Someone has held slots on the <a href="${SITE_URL}/${escapeHtml(hold.saleSlug)}" style="color:#EF3340;">${escapeHtml(hold.saleName)}</a>. Nothing is paid yet: if they don't pay the reservation fee by ${escapeHtml(until)} (UK time), the slots go back on sale. You'll get another email if they pay.</p>
${rowsTable(rows)}
${campaignHtml(utm)}
<p style="margin:24px 0 0 0;">${darkButton(trackerUrl, "Open the sale in admin")}</p>
<p style="margin:12px 0 0 0;font-size:12px;color:#959595;">In admin, "Track slots" shows every hold and sale.</p>`);
  return { subject, html };
}

export async function emailTeamAboutHold(hold: SaleHoldView, holderEmail: string, utm: Utm | null | undefined) {
  try {
    const { subject, html } = buildHoldEmail(hold, holderEmail, utm);
    await send(TEAM_NOTIFY_RECIPIENTS, subject, html, holderEmail);
  } catch (e) {
    console.error("[team-notify] hold email failed", hold.holdId, e);
  }
}

// ---------------------------------------------------------------------------
// Reservation fee paid (deposit)
// ---------------------------------------------------------------------------

export interface DepositInput {
  /** stripePayments doc of this payment (customer, tour date, UTMs, sale). */
  paymentDocId: string;
  bookingId: string;
  bookingDocumentId: string;
  travelerName: string;
  tourPackageName: string;
  amount: number;
  /** Set for a guest paying their own fee: the main booker's name. */
  guestOf?: string;
}

/** Payment-doc fields the deposit email shows. */
export interface DepositDetails {
  email?: string;
  phone?: string;
  travelDate?: string;
  travellers?: number;
  sale?: boolean;
  utm?: Utm | null;
}

export function buildDepositEmail(d: DepositInput, p: DepositDetails) {
  const subject = `Deposit paid: ${d.tourPackageName} · ${d.travelerName}`;
  const bookingUrl = `${ADMIN_BASE_URL}/bookings?tab=bookings&bookingId=${encodeURIComponent(d.bookingDocumentId)}`;
  const rows: [string, string][] = [
    ["Tour", d.tourPackageName],
    ...(p.travelDate ? ([["Travel date", p.travelDate]] as [string, string][]) : []),
    ["Booking ID", d.bookingId],
    ["Name", d.travelerName],
    ...(d.guestOf ? ([["Guest of", d.guestOf]] as [string, string][]) : []),
    ...(p.email ? ([["Email", p.email]] as [string, string][]) : []),
    ...(p.phone ? ([["WhatsApp", p.phone]] as [string, string][]) : []),
    ...(p.travellers && !d.guestOf ? ([["Travellers", String(p.travellers)]] as [string, string][]) : []),
    ["Reservation fee paid", gbp(d.amount)],
    ["Black Friday sale", p.sale ? "Yes (held slots)" : "No"],
  ];
  const html = shell(`
${eyebrow(d.guestOf ? "Guest reservation fee paid" : "Reservation fee paid")}
<h1 style="margin:0 0 16px 0;font-size:22px;">${escapeHtml(d.travelerName)} · ${escapeHtml(d.tourPackageName)}</h1>
<p style="margin:0 0 16px 0;">${escapeHtml(gbp(d.amount))} paid by card. The booking is in admin.</p>
${rowsTable(rows)}
${campaignHtml(p.utm)}
<p style="margin:24px 0 0 0;">${darkButton(bookingUrl, "Open the booking in admin")}</p>`);
  return { subject, html };
}

function depositDetails(data: Record<string, any> | undefined): DepositDetails {
  const c = data?.customer ?? {};
  const digits = String(c.whatsAppNumber ?? "").replace(/[^0-9+]/g, "");
  return {
    email: typeof c.email === "string" ? c.email : undefined,
    phone: digits || undefined,
    travelDate: travelDateLabel(data?.tour?.date) || undefined,
    travellers: Number(data?.booking?.groupSize) || undefined,
    sale: !!data?.sale,
    utm: data?.utm ?? null,
  };
}

/**
 * Emails the team once per payment: the payment doc gets `teamNotify.depositEmailAt`
 * in a transaction, so a webhook retry or a second caller can't send it twice.
 */
export async function emailTeamAboutDeposit(d: DepositInput) {
  try {
    const db = adminDb();
    const ref = db.collection("stripePayments").doc(d.paymentDocId);
    const data = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("teamNotify.depositEmailAt")) return null;
      tx.update(ref, { "teamNotify.depositEmailAt": FieldValue.serverTimestamp() });
      return snap.data() ?? {};
    });
    if (!data) return;
    const details = depositDetails(data);
    const { subject, html } = buildDepositEmail(d, details);
    await send(TEAM_NOTIFY_RECIPIENTS, subject, html, details.email);
  } catch (e) {
    console.error("[team-notify] deposit email failed", d.paymentDocId, e);
  }
}
