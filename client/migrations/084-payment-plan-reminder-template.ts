/**
 * 084 — Add the Payment Plan Reminder email template.
 *
 * WHY
 * ───
 * Customers who paid their reservation fee but never chose a payment plan got no
 * automatic follow-up. `sendPaymentPlanReminders` now reminds them, on the timing
 * in `functions/src/plan-reminders.ts`, using this template.
 *
 * WHAT IT DOES
 * ────────────
 * Uploads `functions/emails/paymentPlanReminder.html` to
 * `emailTemplates/paymentPlanReminder`. Safe to run again: it replaces the content.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run084
 *   npx tsx migrations/migrate.ts 084
 *   npx tsx migrations/migrate.ts rollback084
 */

import { readFileSync } from "fs";
import path from "path";
import { deleteDoc, doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "084-payment-plan-reminder-template";
const TEMPLATE_DOC_ID = "paymentPlanReminder";

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);
  const content = readFileSync(
    path.resolve(__dirname, "..", "functions", "emails", "paymentPlanReminder.html"),
    "utf8",
  );
  console.log(`📧 Template — ${content.length} chars`);

  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
    return {
      message: `${MIGRATION_ID} dry-run`,
      details: { updated: 1, errors: 0 },
    };
  }

  await setDoc(doc(db, "emailTemplates", TEMPLATE_DOC_ID), {
    name: TEMPLATE_DOC_ID,
    content,
    status: "active",
    updatedAt: Timestamp.now(),
    migratedBy: MIGRATION_ID,
  });

  console.log(`\n✅ Payment Plan Reminder template uploaded.`);
  return {
    message: `${MIGRATION_ID} completed`,
    details: { updated: 1, errors: 0 },
  };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);
  await deleteDoc(doc(db, "emailTemplates", TEMPLATE_DOC_ID));
  console.log(`\n✅ Template removed.`);
  return {
    message: `${MIGRATION_ID} rolled back`,
    details: { restored: 1, errors: 0 },
  };
}
