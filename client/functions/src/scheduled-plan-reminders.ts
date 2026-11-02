import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { buildBookingStatusUrl } from "./booking-status-url";
import EmailTemplateService from "./email-template-service";
import GmailApiService from "./gmail-api-service";
import {
  LAST_MINUTE_TERM,
  REMINDERS_START_MS,
  needsPlanReminder,
  nextReminderCount,
  plansOffered,
  reminderTimes,
} from "./plan-reminders";
import {
  computeFinalPaymentDeadline,
  formatDateLikeSheets,
  getBCCList,
} from "./send-booking-status-confirmation";

const db = getFirestore();

const TEMPLATE_NAME = "paymentPlanReminder";
const MAX_SENDS_PER_RUN = 50;

function toMs(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

async function loadTemplate(): Promise<string | null> {
  const snap = await db
    .collection("emailTemplates")
    .where("name", "==", TEMPLATE_NAME)
    .limit(1)
    .get();
  const data = snap.docs[0]?.data();
  return data?.content && (data.status === undefined || data.status === "active")
    ? data.content
    : null;
}

export async function sendPlanReminderEmail(
  booking: FirebaseFirestore.DocumentData,
  template: string,
  gmailService: GmailApiService,
  bccList: string[],
) {
  const term = booking.availablePaymentTerms;
  const isLastMinute = term === LAST_MINUTE_TERM;
  const tourPackage = booking.tourPackageName || "your tour";
  const htmlContent = EmailTemplateService.processTemplate(template, {
    firstName: booking.firstName || booking.fullName || "there",
    tourPackageName: tourPackage,
    tourDate: formatDateLikeSheets(booking.tourDate),
    isLastMinute,
    planCount: plansOffered(term),
    saleName: booking.saleName || "",
    finalPaymentDeadline: computeFinalPaymentDeadline(booking.tourDate),
    bookingStatusUrl: buildBookingStatusUrl(booking.access_token),
    tourPackageCoverImage: booking.tourPackageCoverImage || "",
    currentYear: new Date().getFullYear(),
  });

  await gmailService.sendEmail({
    to: booking.emailAddress,
    subject: isLastMinute
      ? `Action needed: complete your payment for ${tourPackage}`
      : `One step left: choose your payment plan for ${tourPackage}`,
    htmlContent,
    bcc: bccList,
    from: "Bella | ImHereTravels <bella@imheretravels.com>",
  } as any);
}

/** Counts this reminder as sent first, so overlapping runs can't send it twice. */
async function claimReminder(
  ref: FirebaseFirestore.DocumentReference,
  sentCount: number,
  nextCount: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if ((snap.get("planReminderCount") ?? 0) !== sentCount) return false;
    if (String(snap.get("paymentPlan") ?? "").trim()) return false;
    tx.update(ref, {
      planReminderCount: nextCount,
      planReminderLastAt: Timestamp.now(),
    });
    return true;
  });
}

/**
 * Reminds travellers who paid their reservation fee but haven't chosen a payment
 * plan, on the timing in plan-reminders.ts. `config/plan-reminders` can switch it
 * off (`enabled: false`) or log without sending (`dryRun: true`).
 */
export const sendPaymentPlanReminders = onSchedule(
  {
    schedule: "0 * * * *", // Hourly: the shortest reminder gap is 6 hours
    timeZone: "UTC",
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const configDoc = await db.collection("config").doc("plan-reminders").get();
    const config = configDoc.data() ?? {};
    if (config.enabled === false) {
      logger.info("⏭️ Payment plan reminders disabled via config");
      return;
    }
    const dryRun = config.dryRun === true;

    const now = Date.now();
    const snapshot = await db
      .collection("bookings")
      .where("reservationDate", ">=", Timestamp.fromMillis(REMINDERS_START_MS))
      .get();

    const due = snapshot.docs.flatMap((doc) => {
      const booking = doc.data();
      if (!needsPlanReminder(booking)) return [];
      const reservationMs = toMs(booking.reservationDate);
      const tourMs = toMs(booking.tourDate);
      if (reservationMs === null || tourMs === null || tourMs <= now) return [];
      const sentCount = booking.planReminderCount ?? 0;
      const nextCount = nextReminderCount(
        reminderTimes(booking.availablePaymentTerms, reservationMs, tourMs),
        sentCount,
        now,
      );
      return nextCount === null ? [] : [{ doc, booking, sentCount, nextCount }];
    });

    logger.info(`📨 ${due.length} payment plan reminder(s) due (dryRun=${dryRun})`);
    if (due.length === 0 || dryRun) return;

    const template = await loadTemplate();
    if (!template) {
      logger.error(`Email template "${TEMPLATE_NAME}" not found`);
      return;
    }
    const gmailService = new GmailApiService();
    const bccList = await getBCCList();

    let sent = 0;
    for (const { doc, booking, sentCount, nextCount } of due.slice(0, MAX_SENDS_PER_RUN)) {
      if (!(await claimReminder(doc.ref, sentCount, nextCount))) continue;
      try {
        await sendPlanReminderEmail(booking, template, gmailService, bccList);
        sent++;
      } catch (error) {
        logger.error(`❌ Plan reminder failed for ${doc.id}:`, error);
        await doc.ref.update({ planReminderCount: sentCount }).catch(() => {});
      }
    }
    logger.info(`✅ Sent ${sent} payment plan reminder(s)`);
  },
);
