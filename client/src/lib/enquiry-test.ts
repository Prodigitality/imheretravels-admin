import type { Enquiry } from "@/types/enquiries";

/**
 * Test submissions (the team and the ad agency trying the www forms) get
 * flagged automatically when the word "test" appears in the name, email,
 * message or UTM tags, e.g. "test tester", "TEST", utm_source=wxm-test.
 * Staff can override either way from the enquiry panel (`test` field).
 *
 * "test" must stand alone, split by anything but a letter, so "Testa",
 * "contest" or "attestation" don't count. In emails only the part before
 * the @ is checked.
 */
const TEST_WORD = /(^|[^a-z])test([^a-z]|$)/i;

export function looksLikeTest(e: Pick<Enquiry, "name" | "email" | "message" | "utm">): boolean {
  const local = e.email.split("@")[0] ?? "";
  const fields = [e.name, local, e.message, ...Object.values(e.utm ?? {})];
  return fields.some((f) => TEST_WORD.test(f.replace(/[0-9_]+/g, " ")));
}

/** Staff's choice wins; otherwise the automatic check. */
export function isTestEnquiry(e: Pick<Enquiry, "name" | "email" | "message" | "utm" | "test">): boolean {
  return typeof e.test === "boolean" ? e.test : looksLikeTest(e);
}
