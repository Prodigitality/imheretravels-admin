/**
 * 085 — Reservation Confirmed: last-minute bookings and the sale sentence.
 *
 * WHY
 * ───
 * A booking made less than two months before the tour has no payment plan: the
 * full balance is due within 48 hours. The email still quoted a "Final Payment
 * Deadline" of tour date minus two months, which is already in the past (e.g.
 * "Oct 1, 2026" for a Dec 1, 2026 tour booked on Nov 6). Also, the sale box read
 * "sale price.Your party saves" because the engine's trimBlocks/lstripBlocks
 * swallow the line break after "price.".
 *
 * `send-booking-status-confirmation.ts` now passes `isLastMinute` (and no longer
 * asks last-minute bookings to choose a plan). Before that functions deploy the
 * variable is undefined, so the patched template renders exactly as before;
 * this migration is safe to run first.
 *
 * WHAT IT DOES
 * ────────────
 * Patches the live `emailTemplates/C8PKdv5BgAlTSFCm6wS3`:
 *   - Final Payment Deadline box: when `isLastMinute`, the heading becomes
 *     "Full Payment Due" and the text says the balance is due within 48 hours.
 *   - Sale box: a space after "You booked at the sale price."
 * The repo copy is `functions/emails/reservationConfirmationWithQR.html`.
 *
 * Idempotent: skipped when already patched.
 * Reversible: previous `content` stashed in `_migration085`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run085
 *   npx tsx migrations/migrate.ts 085
 *   npx tsx migrations/migrate.ts rollback085
 */

import { deleteField, doc, getDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "085-reservation-confirmed-last-minute";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "C8PKdv5BgAlTSFCm6wS3";
const BACKUP_FIELD = "_migration085";

const MARKER = "{% if isLastMinute %}";

const HEADING = /⚠️ Final Payment Deadline(<\/h4>)/;
const DEADLINE_TEXT =
  /([ \t]*)Your full tour balance must be received no later than\s*<strong>\{\{ finalPaymentDeadline \}\}<\/strong> — 2 months before your departure date\.\s*Any outstanding balance after this date may result in your booking being cancelled\./;
const SALE_SENTENCE = "You booked at the sale price.{% if saleSavings %}";

export function patchTemplate(content: string): string {
  if (content.includes(MARKER)) return content;
  if (!HEADING.test(content)) throw new Error("Could not find the 'Final Payment Deadline' heading.");
  if (!DEADLINE_TEXT.test(content)) throw new Error("Could not find the final payment deadline text.");

  let patched = content.replace(
    HEADING,
    "{% if isLastMinute %}⚠️ Full Payment Due{% else %}⚠️ Final Payment Deadline{% endif %}$1",
  );
  patched = patched.replace(DEADLINE_TEXT, (_m, indent: string) =>
    [
      `${indent}${MARKER}`,
      `${indent}Your tour departs in less than 2 months, so your full balance of`,
      `${indent}<strong>£{{ remainingBalance }}</strong> is due within <strong>48 hours</strong> of booking.`,
      `${indent}Any balance still outstanding after that may result in your booking being cancelled.`,
      `${indent}{% else %}`,
      `${indent}Your full tour balance must be received no later than`,
      `${indent}<strong>{{ finalPaymentDeadline }}</strong> — 2 months before your departure date.`,
      `${indent}Any outstanding balance after this date may result in your booking being cancelled.`,
      `${indent}{% endif %}`,
    ].join("\n"),
  );
  // trimBlocks drops the line break after the tag, so the space must be explicit.
  patched = patched.replace(SALE_SENTENCE, "You booked at the sale price. {% if saleSavings %}");
  return patched;
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.error(`❌ Template ${TEMPLATE_DOC_ID} not found.`);
    return { message: `${MIGRATION_ID} aborted — template missing`, details: { updated: 0, errors: 1 } };
  }

  const data = snap.data() as Record<string, any>;
  const content = String(data.content || "");
  console.log(`📧 "${data.name || TEMPLATE_DOC_ID}" — ${content.length} chars`);

  if (content.includes(MARKER)) {
    console.log("  ⏭️  Already patched — nothing to do.");
    return { message: `${MIGRATION_ID} — already up to date`, details: { updated: 0, errors: 0 } };
  }

  let patched: string;
  try {
    patched = patchTemplate(content);
  } catch (err) {
    console.error(`  ❌ Could not patch template:`, err);
    return { message: `${MIGRATION_ID} aborted — anchor not found`, details: { updated: 0, errors: 1 } };
  }

  console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);

  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
    return { message: `${MIGRATION_ID} dry-run`, details: { updated: 1, errors: 0 } };
  }

  await updateDoc(ref, {
    content: patched,
    [BACKUP_FIELD]: { content },
    updatedAt: Timestamp.now(),
    migratedBy: MIGRATION_ID,
  });

  console.log(`\n✅ Last-minute wording and sale sentence patched.`);
  return { message: `${MIGRATION_ID} completed`, details: { updated: 1, errors: 0 } };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);

  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);
  const backup = snap.data()?.[BACKUP_FIELD] as { content?: string } | undefined;

  if (!backup?.content) {
    console.log("  ℹ️  No backup found — nothing to roll back.");
    return { message: `${MIGRATION_ID} rolled back`, details: { restored: 0, errors: 0 } };
  }

  await updateDoc(ref, {
    content: backup.content,
    [BACKUP_FIELD]: deleteField(),
    updatedAt: Timestamp.now(),
  });

  console.log(`\n✅ Previous template restored.`);
  return { message: `${MIGRATION_ID} rolled back`, details: { restored: 1, errors: 0 } };
}
