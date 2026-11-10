/**
 * Phase 0 end-to-end check against a local admin dev server (BASE) on DEV
 * Firestore + Stripe TEST mode. Regular (non-sale) reservation:
 *   draft → server-priced intent → refused before payment → test card →
 *   confirm → booking → public projections → locked after payment,
 * plus Gmail routes refusing anonymous calls. Deletes everything it creates.
 *
 *   npx next dev --webpack -p 3911   (in another terminal)
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/phase0-e2e.ts
 */
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase-admin-db";

const BASE = process.env.E2E_BASE ?? "http://localhost:3911";
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const post = async (path: string, body: unknown) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
};
const get = async (path: string) => {
  const r = await fetch(BASE + path);
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
};
const toMs = (v: any): number | null =>
  v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : null;

async function main() {
  if (process.env.FIREBASE_PROJECT_ID !== "imheretravels-dev") throw new Error("dev only");
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Stripe test mode only");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = adminDb();
  const created = { payDoc: "", intent: "", bookings: [] as string[], notifications: [] as string[] };
  const startedAt = Date.now();

  // A live tour with a future date and a reservation fee.
  const tours = await db.collection("tourPackages").get();
  let pick: { id: string; name: string; date: string } | null = null;
  for (const t of tours.docs) {
    const d = t.data();
    if (d.status && d.status !== "active") continue;
    if (!(d.pricing?.deposit > 0 || d.reservationFee > 0)) continue;
    const date = (d.travelDates ?? []).find((x: any) => x.isAvailable !== false && (toMs(x.startDate) ?? 0) > Date.now() + 90 * 864e5);
    if (date) { pick = { id: t.id, name: d.name, date: new Date(toMs(date.startDate)!).toISOString().slice(0, 10) }; break; }
  }
  if (!pick) throw new Error("No suitable dev tour");
  console.log(`tour: ${pick.name} ${pick.date}`);

  // Dev sends real "Reservation Confirmed" emails, so use the test inbox
  // (a plus-address) rather than an address that bounces.
  const email = `juancarlosjosegan+phase0-e2e-${Date.now()}@gmail.com`;
  try {
    const anon = await post("/api/gmail/send", { to: "x@example.com", subject: "x", body: "x" });
    check(anon.status === 401, `gmail send refuses anonymous calls (${anon.status})`);
    const anonThreads = await get("/api/gmail/threads");
    check(anonThreads.status === 401, `gmail threads refuses anonymous calls (${anonThreads.status})`);

    const draft = await post("/api/public/reservations", {
      customer: { email, firstName: "Phase", lastName: "Zero", birthdate: "1990-01-01", nationality: "British", whatsAppNumber: "+440000000000" },
      booking: { type: "Single Booking", groupSize: 1, guestDetails: [] },
      tour: { packageId: pick.id, date: pick.date },
    });
    check(draft.status === 200 && !!draft.json.id && draft.json.amount > 0, `draft created, server price £${draft.json.amount}`);
    created.payDoc = draft.json.id;
    const fee = draft.json.amount as number;

    const init = await post("/api/stripe-payments/init-payment", { email, tourPackage: pick.id, tourPackageName: pick.name, amountGBP: 1, paymentDocId: created.payDoc });
    check(init.status === 200 && !!init.json.clientSecret, "init-payment returns a client secret");
    const intentId = String(init.json.clientSecret).split("_secret_")[0];
    created.intent = intentId;
    const intent = await stripe.paymentIntents.retrieve(intentId);
    check(intent.amount === Math.round(fee * 100), `intent charged at the server price (£${intent.amount / 100}, browser sent £1)`);

    const early = await post("/api/stripe-payments/create-booking", { paymentDocId: created.payDoc });
    check(early.status >= 400, `create-booking refused before payment (${early.status})`);
    const earlyConfirm = await post("/api/public/reservations/confirm-payment", { paymentIntentId: intentId, paymentDocId: created.payDoc });
    check(earlyConfirm.status >= 400, `confirm-payment refused before payment (${earlyConfirm.status})`);

    const paid = await stripe.paymentIntents.confirm(intentId, { payment_method: "pm_card_visa", return_url: "https://example.com" });
    check(paid.status === "succeeded", "test card payment succeeded");

    const confirm = await post("/api/public/reservations/confirm-payment", { paymentIntentId: intentId, paymentDocId: created.payDoc });
    check(confirm.status === 200 && confirm.json.status === "reserve_paid", "confirm-payment records reserve_paid");

    const booking = await post("/api/stripe-payments/create-booking", { paymentDocId: created.payDoc });
    check(booking.status === 200 && !!booking.json.bookingId, `booking created (${booking.json.bookingId})`);

    const res = await get(`/api/public/reservations/${created.payDoc}`);
    const r = res.json.reservation ?? {};
    check(res.status === 200 && r.booking?.documentId && r.booking.documentId !== "PENDING", "reservation read-back has the booking");
    check(r.sale === undefined, "regular reservation has no sale block");
    const payDocData = (await db.collection("stripePayments").doc(created.payDoc).get()).data() ?? {};
    created.bookings = [...new Set([...(payDocData.bookingDocumentIds ?? []), r.booking?.documentId].filter(Boolean))];

    const bdoc = (await db.collection("bookings").doc(created.bookings[0]).get()).data() ?? {};
    check(bdoc.reservationFee === fee || bdoc.reservationFee === undefined, `booking reservation fee £${bdoc.reservationFee}`);
    const pub = await get(`/api/public/booking/${bdoc.access_token}`);
    check(pub.status === 200 && pub.json.success !== false, `booking-status projection (${pub.status})`);
    check(pub.json.data?.emailAddress === undefined || typeof pub.json.data?.emailAddress === "string", "projection is the allowlisted view");
    const wrong = await get(`/api/public/booking/${bdoc.access_token}?email=wrong@example.com`);
    check(wrong.status === 403, `wrong email refused (${wrong.status})`);
    const unknown = await get(`/api/public/booking/not-a-real-token-${Date.now()}`);
    check(unknown.status === 404, `unknown token 404 (${unknown.status})`);

    // select-plan: knowing the booking id is not enough.
    const planBody = { bookingDocumentId: created.bookings[0], paymentPlanId: "full_payment" };
    const bare = await post("/api/stripe-payments/select-plan", planBody);
    check(bare.status === 403, `select-plan refuses a bare booking id (${bare.status})`);
    const foreign = await post("/api/stripe-payments/select-plan", { ...planBody, paymentDocId: `not-this-${Date.now()}` });
    check(foreign.status === 403, `select-plan refuses another reservation (${foreign.status})`);
    const owner = await post("/api/stripe-payments/select-plan", { ...planBody, paymentDocId: created.payDoc });
    check(owner.status !== 403, `select-plan accepts the owning reservation (${owner.status} ${owner.json.error ?? ""})`);
    const viaToken = await post("/api/stripe-payments/select-plan", { ...planBody, access_token: bdoc.access_token });
    check(viaToken.status !== 403, `select-plan accepts the booking's access token (${viaToken.status} ${viaToken.json.error ?? ""})`);

    const late = await post("/api/stripe-payments/update-payment", { paymentDocId: created.payDoc, amountGBP: 1 });
    check(late.status >= 400, `update-payment refused once paid (${late.status})`);
    const del = await fetch(`${BASE}/api/public/reservations/${created.payDoc}`, { method: "DELETE" });
    check(del.status >= 400, `delete refused once paid (${del.status})`);

    const notes = await db.collection("notifications").where("createdAt", ">=", new Date(startedAt)).get().catch(() => null);
    created.notifications = (notes?.docs ?? []).filter((d) => JSON.stringify(d.data()).includes(String(booking.json.bookingId))).map((d) => d.id);
    check(created.notifications.length > 0, `server wrote the staff notification (${created.notifications.length})`);
  } finally {
    if (created.intent) {
      await stripe.refunds.create({ payment_intent: created.intent }).catch(() => {});
      await stripe.paymentIntents.cancel(created.intent).catch(() => {});
    }
    for (const id of created.bookings) await db.collection("bookings").doc(id).delete();
    for (const id of created.notifications) await db.collection("notifications").doc(id).delete();
    if (created.payDoc) await db.collection("stripePayments").doc(created.payDoc).delete();
    console.log(`cleanup: ${created.bookings.length} booking(s), ${created.notifications.length} notification(s), payment doc ${created.payDoc || "-"}`);
  }
  console.log(failures ? `${failures} FAILED` : "ALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
