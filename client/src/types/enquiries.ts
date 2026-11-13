/**
 * Tour enquiries ("Inquire now" on www sale cards and tour pages), submitted
 * through www /api/enquiry into the server-only `enquiries` collection.
 */

export const ENQUIRY_STATUSES = ["new", "contacted", "booked", "closed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  booked: "Booked",
  closed: "Closed",
};

/** Where on www the visitor pressed "Inquire now". */
export const ENQUIRY_LOCATION_LABELS: Record<string, string> = {
  sale_card: "Sale page card",
  tour_page: "Tour page",
  tour_mobile_bar: "Tour page (mobile bar)",
};

export interface EnquiryNote {
  text: string;
  by: string;
  byName: string;
  /** ISO string */
  at: string;
}

export interface Enquiry {
  id: string;
  status: EnquiryStatus;
  name: string;
  email: string;
  phone: string;
  message: string;
  tour: { slug: string | null; name: string | null } | null;
  subscribe: boolean;
  location: string | null;
  page: string;
  notes: EnquiryNote[];
  /** "sent" | "failed" | "skipped_dev" | "pending" */
  teamEmail: string | null;
  /** ISO strings */
  createdAt: string | null;
  updatedAt: string | null;
}
