import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Minimal Firestore: bookings/b1 (token "tok-1", no plan yet) and two reservations.
const docs: Record<string, Record<string, unknown> | undefined> = {};
const updates: string[] = [];
vi.mock("@/lib/server-firestore", () => ({
  db: {},
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: async (ref: { path: string }) => ({
    exists: () => docs[ref.path] !== undefined,
    data: () => docs[ref.path],
  }),
  updateDoc: async (ref: { path: string }) => {
    updates.push(ref.path);
  },
  serverTimestamp: () => "ts",
}));

vi.mock("@/lib/notification-server", () => ({ createNotification: async () => undefined }));

import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(new Request("http://x/api/stripe-payments/select-plan", { method: "POST", body: JSON.stringify(body) }) as any);

describe("select-plan: caller must hold the booking", () => {
  beforeEach(() => {
    updates.length = 0;
    for (const k of Object.keys(docs)) delete docs[k];
    docs["bookings/b1"] = { access_token: "tok-1" };
    docs["stripePayments/pay-1"] = { bookingDocumentIds: ["b1", "b2"] };
    docs["stripePayments/pay-other"] = { bookingDocumentIds: ["b9"] };
  });

  it("refuses a bare booking id", async () => {
    const res = await post({ bookingDocumentId: "b1", paymentPlanId: "p1" });
    expect(res.status).toBe(403);
    expect(updates).toEqual([]);
  });

  it("refuses a wrong access token", async () => {
    const res = await post({ bookingDocumentId: "b1", paymentPlanId: "p1", access_token: "nope" });
    expect(res.status).toBe(403);
  });

  it("refuses a reservation that didn't create this booking", async () => {
    const res = await post({ bookingDocumentId: "b1", paymentPlanId: "p1", paymentDocId: "pay-other" });
    expect(res.status).toBe(403);
  });

  it("refuses an unknown reservation or a path-like id", async () => {
    expect((await post({ bookingDocumentId: "b1", paymentPlanId: "p1", paymentDocId: "missing" })).status).toBe(403);
    expect(
      (await post({ bookingDocumentId: "b1", paymentPlanId: "p1", paymentDocId: "pay-1/../pay-1" })).status,
    ).toBe(403);
  });

  // Past the check the route goes on to price the plan; these only assert it got past 403.
  it("accepts the booking's access token", async () => {
    const res = await post({ bookingDocumentId: "b1", paymentPlanId: "p1", access_token: "tok-1" });
    expect(res.status).not.toBe(403);
  });

  it("accepts the reservation that created the booking", async () => {
    const res = await post({ bookingDocumentId: "b1", paymentPlanId: "p1", paymentDocId: "pay-1" });
    expect(res.status).not.toBe(403);
  });
});
