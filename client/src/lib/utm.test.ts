import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-firestore", () => ({ db: {}, doc: vi.fn(), getDoc: vi.fn() }));

import { cleanUtm } from "./utm";
import { draftDocFields, readDraftInput } from "./public-reservations-server";

describe("cleanUtm", () => {
  it("keeps only the five UTM keys, trimmed", () => {
    expect(
      cleanUtm({ utm_source: " facebook ", utm_campaign: "bf2026", utm_medium: 5, gclid: "x", evil: "y" }),
    ).toEqual({ utm_source: "facebook", utm_campaign: "bf2026" });
  });

  it("returns null for nothing usable", () => {
    expect(cleanUtm(null)).toBeNull();
    expect(cleanUtm("utm_source=facebook")).toBeNull();
    expect(cleanUtm({ utm_source: "   " })).toBeNull();
  });

  it("caps each value at 150 characters", () => {
    expect(cleanUtm({ utm_content: "x".repeat(500) })?.utm_content).toHaveLength(150);
  });
});

describe("reservation draft UTMs", () => {
  const body = {
    customer: { email: "a@x.com", firstName: "A", lastName: "B" },
    booking: { type: "Single Booking", groupSize: 1 },
    tour: { packageId: "tour-1", date: "2026-12-10" },
  };
  const price = { ok: true as const, amount: 250, packageName: "Tour 1" } as Parameters<typeof draftDocFields>[1];

  it("cleans the browser's utm and saves it on the reservation", () => {
    const parsed = readDraftInput({ ...body, utm: { utm_source: "facebook", junk: "x" } });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.utm).toEqual({ utm_source: "facebook" });
    expect(draftDocFields(parsed.input, price).utm).toEqual({ utm_source: "facebook" });
  });

  it("leaves utm off the doc when there is none, so a later edit can't clear it", () => {
    const parsed = readDraftInput(body);
    if (!parsed.ok) throw new Error(parsed.error);
    expect("utm" in draftDocFields(parsed.input, price)).toBe(false);
  });
});
