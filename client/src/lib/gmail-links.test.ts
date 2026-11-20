import { describe, expect, it } from "vitest";
import { gmailComposeUrl, gmailLeadSearchUrl } from "./gmail-links";

describe("gmail links", () => {
  it("searches for the lead's reference id or the customer's address", () => {
    const url = gmailLeadSearchUrl("Ab12Cd34", "sarah@example.com");
    expect(url).toBe("https://mail.google.com/mail/u/0/#search/%22Ab12Cd34%22%20OR%20sarah%40example.com");
    expect(decodeURIComponent(url.split("#search/")[1])).toBe('"Ab12Cd34" OR sarah@example.com');
  });

  it("falls back to the address alone without an id", () => {
    expect(decodeURIComponent(gmailLeadSearchUrl("", "a@b.co").split("#search/")[1])).toBe("a@b.co");
  });

  it("builds a compose link", () => {
    const u = new URL(gmailComposeUrl("a@b.co", "Hi there", "Hi A,\n\n"));
    expect(u.searchParams.get("view")).toBe("cm");
    expect(u.searchParams.get("to")).toBe("a@b.co");
    expect(u.searchParams.get("su")).toBe("Hi there");
  });
});
