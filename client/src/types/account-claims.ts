/**
 * Customer-portal "Needs Review" cases (portal docs/02-data-model.md
 * `accountClaims`). The portal opens them; staff resolve them here.
 * Owner: ops/support, target 2 working days (portal docs/05 P2).
 */

export const CLAIM_STATES = ["open", "needs_evidence", "approved", "rejected"] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const CLAIM_STATE_LABELS: Record<ClaimState, string> = {
  open: "Open",
  needs_evidence: "Waiting for customer",
  approved: "Approved",
  rejected: "Rejected",
};

export type ConflictType = "already_linked" | "ambiguous" | "email_mismatch" | "missing_email";

export const CONFLICT_LABELS: Record<ConflictType, string> = {
  already_linked: "Already on another account",
  ambiguous: "Shared email in a group",
  email_mismatch: "Booked under another email",
  missing_email: "Booking has no email",
};

/** One line for staff on what the customer asked and why it wasn't automatic. */
export const CONFLICT_HELP: Record<ConflictType, string> = {
  already_linked:
    "The customer says this traveller record is theirs, but it's already linked to another account. Approving moves it to this customer.",
  ambiguous:
    "Several travellers on this booking share the customer's email, so we couldn't tell which one is them. Approve only if this traveller is the customer.",
  email_mismatch:
    "The customer thinks they booked under a different email. Find the booking from their message, then check the evidence.",
  missing_email: "The booking has no email to match against. Check the evidence before linking.",
};

export type DecisionAction = "approve" | "needs_evidence" | "reject";

export const DECISION_LABELS: Record<DecisionAction, string> = {
  approve: "Approve and link",
  needs_evidence: "Ask the customer for evidence",
  reject: "Reject",
};

/** Reason codes per decision (05 P2: every decision carries one). */
export const REASON_CODES: Record<DecisionAction, readonly string[]> = {
  approve: ["evidence_matched", "shared_email_confirmed", "previous_link_wrong", "same_person_other_email"],
  needs_evidence: ["evidence_requested"],
  reject: ["evidence_insufficient", "not_the_traveller", "booking_not_found", "linked_correctly_elsewhere", "duplicate_request"],
};

export const REASON_LABELS: Record<string, string> = {
  evidence_matched: "Evidence matched (ref, birthdate, payment email)",
  shared_email_confirmed: "Confirmed which traveller they are",
  previous_link_wrong: "The other account linked it by mistake",
  same_person_other_email: "Same person, booked under another email",
  evidence_requested: "Asked for ref, birthdate and payment email",
  evidence_insufficient: "Evidence didn't match or never arrived",
  not_the_traveller: "Not the traveller on this record",
  booking_not_found: "Couldn't find the booking",
  linked_correctly_elsewhere: "Already linked to the right account",
  duplicate_request: "Duplicate of another request",
};

/** What staff check before approving (05 P2). */
export const EVIDENCE_CHECKLIST = [
  "Booking reference",
  "Date of birth on the booking",
  "Email used to pay, or the payment receipt",
] as const;

export type ClaimBooking = {
  documentId: string;
  ref: string;
  tourName: string;
  tourDate: string | null; // YYYY-MM-DD
  travellerName: string;
  email: string;
  isMainBooker: boolean;
  bookingType: string;
  /** Who holds the active link now, if anyone. */
  holder: null | { isClaimant: boolean; email: string; name: string; linkedAt: string | null };
};

export type ClaimHistoryEntry = {
  action: DecisionAction;
  reasonCode: string;
  note: string;
  byName: string;
  at: string | null;
  emailed: boolean;
};

export type AccountClaim = {
  id: string;
  conflictType: ConflictType;
  state: ClaimState;
  submittedAt: string | null;
  resolvedAt: string | null;
  /** submittedAt + 2 working days (Manila). */
  dueAt: string | null;
  overdue: boolean;
  reasonCode: string | null;
  riskFlags: string[];
  /** The customer's own words, for manual-check requests. */
  customerMessage: string;
  customer: {
    userId: string;
    email: string;
    name: string;
    accountCreatedAt: string | null;
    emailVerifiedAt: string | null;
  };
  booking: ClaimBooking | null;
  history: ClaimHistoryEntry[];
  /** Emails that failed to send after a decision; staff follow up by hand. */
  emailFailures: { kinds: string[]; at: string | null }[];
};

export type ClaimDecisionInput = {
  action: DecisionAction;
  reasonCode: string;
  note: string;
  /** Required for manual-check cases: the booking staff found. Ignored otherwise. */
  bookingDocumentId?: string;
  /** Approving a record that another account holds must say so explicitly. */
  revokeExisting?: boolean;
  emailCustomer: boolean;
};
