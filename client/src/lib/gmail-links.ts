/**
 * Links that open Gmail (bella@'s mailbox is the first account in the team's
 * browser, hence /u/0) for an enquiry or partnership application.
 *
 * The website's emails for a lead (team notification and the customer's
 * receipt/confirmation) carry "Reference: <doc id>". Searching for that id,
 * or the customer's address, finds them, so staff can open the customer's
 * receipt and Reply inside that thread instead of starting a new email.
 * Older leads (before the Reference line) are still found by address.
 */

const GMAIL = "https://mail.google.com/mail/u/0/";

/** Gmail search for a lead's emails: its reference id or the customer's address. */
export function gmailLeadSearchUrl(docId: string, email: string): string {
  const terms = [docId ? `"${docId}"` : "", email.trim()].filter(Boolean);
  return `${GMAIL}#search/${encodeURIComponent(terms.join(" OR "))}`;
}

/** A new Gmail compose window to the customer (not threaded). */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `${GMAIL}?${params.toString()}`;
}
