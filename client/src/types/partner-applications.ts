/**
 * Work With Us applications, submitted on www (/work-with-us → /api/work-with-us)
 * into the server-only `partnerApplications` collection. www owns the form
 * config; each doc carries a labelled `answerList` so admin can display it
 * without knowing the questions.
 */

export const PARTNER_APPLICATION_TYPES = ["host", "affiliate", "supplier"] as const;
export type PartnerApplicationType = (typeof PARTNER_APPLICATION_TYPES)[number];

export const PARTNER_APPLICATION_STATUSES = [
  "new",
  "reviewing",
  "contacted",
  "accepted",
  "declined",
] as const;
export type PartnerApplicationStatus = (typeof PARTNER_APPLICATION_STATUSES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerApplicationType, string> = {
  host: "Host Applications",
  affiliate: "Affiliate Applications",
  supplier: "Supplier Enquiries",
};

export const PARTNER_STATUS_LABELS: Record<PartnerApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  contacted: "Contacted",
  accepted: "Accepted",
  declined: "Declined",
};

export interface PartnerApplicationNote {
  text: string;
  by: string;
  byName: string;
  /** ISO string */
  at: string;
}

export interface PartnerApplication {
  id: string;
  type: PartnerApplicationType;
  status: PartnerApplicationStatus;
  name: string;
  email: string;
  country: string;
  organisation?: string;
  answerList: { label: string; value: string }[];
  /** Short per-type highlights for the list view (e.g. "Content Creator", "10,000 – 50,000"). */
  summary: string[];
  /** Destinations the applicant picked (host/affiliate) or covers (supplier). */
  destinations: string;
  attachment: { name: string; size: number; contentType: string } | null;
  notes: PartnerApplicationNote[];
  emails: { team?: string; applicant?: string } | null;
  /** ISO strings */
  createdAt: string | null;
  updatedAt: string | null;
  statusChangedBy?: string | null;
}
