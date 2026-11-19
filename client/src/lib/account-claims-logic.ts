/**
 * Rules for resolving customer-portal account claims. Pure, so the API route
 * and the tests share one definition.
 */
import {
  REASON_CODES,
  type ClaimDecisionInput,
  type ClaimState,
  type ConflictType,
  type DecisionAction,
} from "@/types/account-claims";

export const MAX_NOTE = 2000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8, no daylight saving

/** The SLA clock (05 P2): N working days later, skipping Saturday and Sunday in Manila. */
export function addWorkingDays(from: Date, days: number): Date {
  const local = new Date(from.getTime() + MANILA_OFFSET_MS);
  let left = days;
  while (left > 0) {
    local.setUTCDate(local.getUTCDate() + 1);
    const dow = local.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return new Date(local.getTime() - MANILA_OFFSET_MS);
}

export function isDecidable(state: ClaimState): boolean {
  return state === "open" || state === "needs_evidence";
}

const ID_RE = /^[A-Za-z0-9]{10,40}$/;

/** Parses and checks a staff decision. Returns the cleaned input or an error message for staff. */
export function parseDecision(
  body: unknown,
  claim: { state: ClaimState; conflictType: ConflictType; bookingDocumentId: string | null },
): { ok: true; value: Omit<ClaimDecisionInput, "bookingDocumentId"> & { bookingDocumentId: string | null } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request" };
  const b = body as Record<string, unknown>;
  const action = b.action as DecisionAction;
  if (!["approve", "needs_evidence", "reject"].includes(action)) return { ok: false, error: "Choose a decision" };
  if (!isDecidable(claim.state)) return { ok: false, error: "This case has already been resolved" };
  if (action === "needs_evidence" && claim.state === "needs_evidence") {
    return { ok: false, error: "We're already waiting for this customer's evidence" };
  }

  const reasonCode = typeof b.reasonCode === "string" ? b.reasonCode : "";
  if (!REASON_CODES[action].includes(reasonCode)) return { ok: false, error: "Choose a reason" };

  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE) return { ok: false, error: `Notes must be ${MAX_NOTE} characters or fewer` };

  // Manual-check cases arrive without a booking; staff pick one before approving.
  let bookingDocumentId = claim.bookingDocumentId;
  if (action === "approve" && !bookingDocumentId) {
    const chosen = typeof b.bookingDocumentId === "string" ? b.bookingDocumentId : "";
    if (!ID_RE.test(chosen)) return { ok: false, error: "Find and select the customer's booking first" };
    bookingDocumentId = chosen;
  }

  return {
    ok: true,
    value: {
      action,
      reasonCode,
      note,
      bookingDocumentId,
      revokeExisting: action === "approve" && b.revokeExisting === true,
      emailCustomer: b.emailCustomer !== false,
    },
  };
}

export type ApprovalPlan =
  | { kind: "link" }
  | { kind: "revoke_and_link"; previousUserId: string; previousLinkId: string }
  | { kind: "already_linked" }
  | { kind: "error"; error: string };

/** What approving does to the one-active-link-per-traveller guard. */
export function planApproval(
  guard: { userId?: string; linkId?: string; status?: string } | null,
  claimantUserId: string,
  revokeExisting: boolean,
): ApprovalPlan {
  if (!guard || guard.status !== "active") return { kind: "link" };
  if (guard.userId === claimantUserId) return { kind: "already_linked" };
  if (!revokeExisting) {
    return { kind: "error", error: "This traveller is linked to another account. Confirm removing it from that account to approve." };
  }
  if (!guard.userId || !guard.linkId) return { kind: "error", error: "The existing link is incomplete; ask a developer to check it" };
  return { kind: "revoke_and_link", previousUserId: guard.userId, previousLinkId: guard.linkId };
}
