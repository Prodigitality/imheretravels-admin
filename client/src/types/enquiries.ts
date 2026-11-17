/**
 * Leads from www, in the server-only `enquiries` collection: tour enquiries
 * ("Inquire now" on sale cards and tour pages, www /api/enquiry) and messages
 * from the /contact-us form (www /api/contact).
 */

export type EnquiryForm = "tour_enquiry" | "contact_us";

export const ENQUIRY_FORM_LABELS: Record<EnquiryForm, string> = {
  tour_enquiry: "Tour enquiry",
  contact_us: "Contact form",
};

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
  tour_page_top: "Tour page (top, mobile)",
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
  form: EnquiryForm;
  status: EnquiryStatus;
  name: string;
  email: string;
  phone: string;
  message: string;
  tour: { slug: string | null; name: string | null } | null;
  subscribe: boolean;
  location: string | null;
  page: string;
  /** Landing-page UTMs saved by www (source.utm), e.g. { utm_source: "facebook" }. */
  utm: Record<string, string> | null;
  notes: EnquiryNote[];
  /** Staff marked it a test (true) or not a test (false); null = automatic (lib/enquiry-test). */
  test: boolean | null;
  /** "sent" | "failed" | "skipped_dev" | "pending" */
  teamEmail: string | null;
  /** ISO strings */
  createdAt: string | null;
  updatedAt: string | null;
}
