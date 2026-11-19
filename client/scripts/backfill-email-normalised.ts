#!/usr/bin/env tsx
/**
 * One-off / catch-up: set `bookings.emailAddressNormalised` on existing
 * bookings, so the customer portal finds bookings whose email was typed with
 * capitals, spaces or pasted invisible characters.
 *
 * The Cloud Function `onBookingEmailNormalised` keeps the field in step from
 * now on; this script fills in the bookings written before it existed. Same
 * rule (functions/src/booking-email-match.ts), and idempotent: bookings that
 * are already right are skipped.
 *
 * Emails: no trigger reacts to this field. The other bookings triggers act on
 * their own fields changing, so each write only makes them start and return.
 *
 * Prints counts and booking references, never email addresses.
 *
 * Usage: npx tsx scripts/backfill-email-normalised.ts --dev|--prod [--apply]
 */
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import { emailForMatching, normalisedEmailChange } from "../functions/src/booking-email-match";

const APPLY = process.argv.includes("--apply");
const BATCH = 400;

async function main() {
  const target = targetFromArgv();
  const { db } = initFirestore(target);
  console.log(`  TARGET: ${target}   MODE: ${APPLY ? "APPLY" : "DRY RUN (no writes)"}\n`);

  const snap = await db.collection("bookings").get();
  const sets: { id: string; ref: string; value: string; differsFromRaw: boolean }[] = [];
  const removes: { id: string; ref: string }[] = [];
  let ok = 0;
  let noEmail = 0;

  for (const d of snap.docs) {
    const b = d.data();
    const change = normalisedEmailChange(b);
    const ref = String(b.bookingId ?? d.id);
    if (change === undefined) {
      if (emailForMatching(b.emailAddress) || emailForMatching(b.email)) ok += 1;
      else noEmail += 1;
      continue;
    }
    if (change === null) removes.push({ id: d.id, ref });
    else sets.push({ id: d.id, ref, value: change, differsFromRaw: change !== String(b.emailAddress ?? b.email ?? "") });
  }

  const fixed = sets.filter((s) => s.differsFromRaw);
  console.log(`  bookings:                 ${snap.size}`);
  console.log(`  already right:            ${ok}`);
  console.log(`  no email:                 ${noEmail}`);
  console.log(`  to set:                   ${sets.length}`);
  console.log(`    of which the stored email has capitals/spaces (only findable after this): ${fixed.length}`);
  for (const s of fixed.slice(0, 25)) console.log(`      ${s.ref}`);
  if (fixed.length > 25) console.log(`      … and ${fixed.length - 25} more`);
  console.log(`  to remove (email gone):   ${removes.length}\n`);

  if (!APPLY) {
    console.log("  Dry run only. Re-run with --apply to write.");
    return;
  }

  const writes = [
    ...sets.map((s) => ({ id: s.id, value: s.value as string | admin.firestore.FieldValue })),
    ...removes.map((r) => ({ id: r.id, value: admin.firestore.FieldValue.delete() })),
  ];
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(db.collection("bookings").doc(w.id), { emailAddressNormalised: w.value });
    }
    await batch.commit();
    console.log(`  wrote ${Math.min(i + BATCH, writes.length)} / ${writes.length}`);
  }
  console.log("  Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
