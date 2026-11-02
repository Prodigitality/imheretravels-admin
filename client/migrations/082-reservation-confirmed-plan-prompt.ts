/**
 * 082 — Reservation Confirmed: prompt customers who still need a payment plan.
 *
 * WHY
 * ───
 * The email now goes out straight after the reservation fee is paid
 * (`onReservationPaid`), before a plan is chosen, and guests no longer have their
 * plan chosen for them. The email has to tell them they can choose it from their
 * booking status page.
 *
 * `send-booking-status-confirmation.ts` now passes `needsPaymentPlan`. Before
 * that functions deploy the variable is undefined and the section stays hidden,
 * so this migration is safe to run first.
 *
 * WHAT IT DOES
 * ────────────
 * Patches the live `emailTemplates/C8PKdv5BgAlTSFCm6wS3`, adding the section above
 * the Final Payment Deadline notice. The repo copy is
 * `functions/emails/reservationConfirmationWithQR.html`.
 *
 * Idempotent: skipped when the section is present.
 * Reversible: previous `content` stashed in `_migration082`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run082
 *   npx tsx migrations/migrate.ts 082
 *   npx tsx migrations/migrate.ts rollback082
 */

import { deleteField, doc, getDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "082-reservation-confirmed-plan-prompt";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "C8PKdv5BgAlTSFCm6wS3";
const BACKUP_FIELD = "_migration082";

const MARKER = "Next step: choose your payment plan";

// The block goes immediately above the Final Payment Deadline notice.
const POLICY_ANCHOR = /([ \t]*<!--\s*Payment Policy Notice\s*-->)/;

const PLAN_BLOCK = `            <!-- Choose Payment Plan -->
            {% if needsPaymentPlan %}
            <div style="
                                            background-color: #fff8e6;
                                            padding: 15px 20px;
                                            border-radius: 12px;
                                            margin: 25px 0;
                                            border-left: 5px solid #f59e0b;
                                            ">
                <h4 style="color: #b45309; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${MARKER}</h4>
                <p style="font-size: 13px; color: #333333; margin: 0 0 10px 0;">
                    Your reservation fee is paid. If you haven't chosen your payment plan yet, you can do it
                    any time from your booking status page. Your payment schedule starts once you've chosen.
                </p>
                <a href="{{ bookingStatusUrl }}" style="color: #c0392b; font-size: 13px; font-weight: bold;">Choose your payment plan</a>
            </div>
            {% endif %}
`;

export function patchTemplate(content: string): string {
  if (content.includes(MARKER)) return content;

  if (!POLICY_ANCHOR.test(content)) {
    throw new Error("Could not find the '<!-- Payment Policy Notice -->' anchor.");
  }

  return content.replace(POLICY_ANCHOR, `${PLAN_BLOCK}$1`);
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.error(`❌ Template ${TEMPLATE_DOC_ID} not found.`);
    return {
      message: `${MIGRATION_ID} aborted — template missing`,
      details: { updated: 0, errors: 1 },
    };
  }

  const data = snap.data() as Record<string, any>;
  const content = String(data.content || "");
  console.log(`📧 "${data.name || TEMPLATE_DOC_ID}" — ${content.length} chars`);

  if (content.includes(MARKER)) {
    console.log("  ⏭️  Plan prompt already present — nothing to do.");
    return {
      message: `${MIGRATION_ID} — already up to date`,
      details: { updated: 0, errors: 0 },
    };
  }

  let patched: string;
  try {
    patched = patchTemplate(content);
  } catch (err) {
    console.error(`  ❌ Could not patch template:`, err);
    return {
      message: `${MIGRATION_ID} aborted — anchor not found`,
      details: { updated: 0, errors: 1 },
    };
  }

  console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);

  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
    return {
      message: `${MIGRATION_ID} dry-run`,
      details: { updated: 1, errors: 0 },
    };
  }

  await updateDoc(ref, {
    content: patched,
    [BACKUP_FIELD]: { content },
    updatedAt: Timestamp.now(),
    migratedBy: MIGRATION_ID,
  });

  console.log(`\n✅ Plan prompt added.`);
  return {
    message: `${MIGRATION_ID} completed`,
    details: { updated: 1, errors: 0 },
  };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);

  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);
  const backup = snap.data()?.[BACKUP_FIELD] as { content?: string } | undefined;

  if (!backup?.content) {
    console.log("  ℹ️  No backup found — nothing to roll back.");
    return {
      message: `${MIGRATION_ID} rolled back`,
      details: { restored: 0, errors: 0 },
    };
  }

  await updateDoc(ref, {
    content: backup.content,
    [BACKUP_FIELD]: deleteField(),
    updatedAt: Timestamp.now(),
  });

  console.log(`\n✅ Previous template restored.`);
  return {
    message: `${MIGRATION_ID} rolled back`,
    details: { restored: 1, errors: 0 },
  };
}
