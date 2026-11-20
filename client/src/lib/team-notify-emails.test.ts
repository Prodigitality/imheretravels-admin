import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase-admin-db", () => ({ adminDb: vi.fn() }));
vi.mock("@/lib/gmail/gmail-api-service", () => ({ default: vi.fn() }));

const { buildDepositEmail, buildHoldEmail, campaignHtml, travelDateLabel } = await import("./team-notify-emails");

const hold = {
  holdId: "hold123",
  saleId: "sale1",
  saleName: "Black Friday 2026",
  saleSlug: "black-friday-2026",
  checkoutMode: "auto",
  tourPackageId: "t1",
  tourSlug: "china-discovery",
  tourName: "China Discovery",
  displayName: "China Discovery",
  partySize: 2,
  slots: [
    { index: 3, salePrice: 1119, originalPrice: 1399 },
    { index: 4, salePrice: 1119, originalPrice: 1399 },
  ],
  excludedDates: [],
  status: "active",
  paying: false,
  displayExpiresAt: "2026-11-20T10:15:00Z",
  expiresAt: "2026-11-20T10:17:00Z",
  serverNow: "2026-11-20T10:00:00Z",
  token: "SECRET-HOLD-TOKEN",
} as const;

describe("team notify emails", () => {
  it("hold email: tour, people, price, expiry in UK time, UTMs, admin link", () => {
    const { subject, html } = buildHoldEmail(hold as never, "sam@example.com", { utm_source: "facebook", utm_campaign: "bf26" });
    expect(subject).toBe("Slot hold: China Discovery · 2 people");
    expect(html).toContain("from £1,119 per person");
    expect(html).toContain("20 Nov, 10:15 (UK time)");
    expect(html).toContain("sam@example.com");
    expect(html).toContain("facebook");
    expect(html).toContain("/tours/sales/sale1/edit");
    expect(html).not.toContain("SECRET-HOLD-TOKEN");
  });

  it("deposit email: amount, booking link, guest line, no-UTM note", () => {
    const { subject, html } = buildDepositEmail(
      { paymentDocId: "p1", bookingId: "SB-CD-1", bookingDocumentId: "b1", travelerName: "Sam Lee", tourPackageName: "China Discovery", amount: 250, guestOf: "Alex Lee" },
      { email: "sam@example.com", travelDate: "1 Mar 2027", sale: true, utm: null },
    );
    expect(subject).toBe("Deposit paid: China Discovery · Sam Lee");
    expect(html).toContain("£250 paid by card");
    expect(html).toContain("Guest of");
    expect(html).toContain("Yes (held slots)");
    expect(html).toContain("bookingId=b1");
    expect(html).toContain("Campaign (UTM): none");
  });

  it("escapes what customers typed", () => {
    expect(campaignHtml({ utm_source: "<script>" })).toContain("&lt;script&gt;");
  });

  it("formats travel dates from Timestamps, JSON timestamps and strings", () => {
    const s = Date.parse("2027-03-01T00:00:00Z") / 1000;
    expect(travelDateLabel({ _seconds: s })).toBe("1 Mar 2027");
    expect(travelDateLabel({ toDate: () => new Date(s * 1000) })).toBe("1 Mar 2027");
    expect(travelDateLabel("2027-03-01")).toBe("1 Mar 2027");
    expect(travelDateLabel(null)).toBe("");
  });
});
