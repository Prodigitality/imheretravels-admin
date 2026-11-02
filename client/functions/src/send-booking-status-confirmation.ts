import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import * as QRCode from "qrcode";
import GmailApiService from "./gmail-api-service";
import EmailTemplateService from "./email-template-service";
import { buildBookingStatusUrl } from "./booking-status-url";

const db = getFirestore();

/**
 * Format date like Google Sheets: "Dec 2, 2025"
 */
export function formatDateLikeSheets(dateValue: any): string {
  if (!dateValue) return "";

  try {
    let date: Date | null = null;

    if (dateValue && typeof dateValue === "object" && dateValue._seconds) {
      date = new Date(dateValue._seconds * 1000);
    } else if (
      dateValue &&
      typeof dateValue === "object" &&
      dateValue.seconds
    ) {
      date = new Date(dateValue.seconds * 1000);
    } else if (typeof dateValue === "string" && dateValue.trim() !== "") {
      const trimmedValue = dateValue.trim();
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const hasMonthName = monthNames.some((month) =>
        trimmedValue.includes(month),
      );

      if (hasMonthName) {
        return trimmedValue;
      }

      date = new Date(trimmedValue);
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else if (dateValue.toDate) {
      date = dateValue.toDate();
    }

    if (date && !isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
      });
    }

    return "";
  } catch (error) {
    logger.warn("Error formatting date:", error);
    return "";
  }
}

/**
 * Get BCC list from bcc-users collection
 */
export async function getBCCList(): Promise<string[]> {
  try {
    const bccUsersSnap = await db.collection("bcc-users").get();
    const bccList = bccUsersSnap.docs
      .map((doc) => doc.data())
      .filter((user: any) => user.isActive === true)
      .map((user: any) => user.email)
      .filter((email: string) => email && email.trim() !== "");

    logger.info(`Found ${bccList.length} active BCC users`);
    return bccList;
  } catch (error) {
    logger.error("Error fetching BCC users:", error);
    return [];
  }
}

/**
 * Generate QR code as base64 data URL
 */
async function generateQRCode(url: string): Promise<string> {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
    return qrCodeDataURL;
  } catch (error) {
    logger.error("Error generating QR code:", error);
    throw new Error("Failed to generate QR code");
  }
}

const GROUP_BOOKING_TYPES = ["Duo Booking", "Group Booking"];

function isGroupBookingType(bookingType: any): boolean {
  return GROUP_BOOKING_TYPES.includes(String(bookingType));
}

function toNumber(value: any): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/** Total tour cost for one traveller (discounted price wins when present). */
function memberTotalCost(booking: any): number {
  return toNumber(booking.discountedTourCost || booking.originalTourCost || 0);
}

/** What one traveller saves on a sale booking; 0 for any other booking. */
function memberSaleSavings(booking: any): number {
  if (!booking.saleName) return 0;
  return (
    toNumber(booking.saleDiscountGBP) ||
    Math.max(
      0,
      toNumber(booking.originalTourCost) - toNumber(booking.discountedTourCost),
    )
  );
}

/** Two calendar months before the tour date, formatted like the rest of the email. */
export function computeFinalPaymentDeadline(rawTourDate: any): string {
  if (!rawTourDate) return "";
  let d: Date | null = null;
  if (typeof rawTourDate === "object" && (rawTourDate as any)._seconds)
    d = new Date((rawTourDate as any)._seconds * 1000);
  else if (typeof rawTourDate === "object" && (rawTourDate as any).seconds)
    d = new Date((rawTourDate as any).seconds * 1000);
  else if (rawTourDate instanceof Date) d = rawTourDate;
  else if (typeof rawTourDate === "string") {
    const parsed = new Date(rawTourDate.trim());
    d = isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!d) return "";
  return formatDateLikeSheets(
    new Date(d.getFullYear(), d.getMonth() - 2, d.getDate()),
  );
}

/**
 * Every booking in a travel party, main booker first.
 *
 * Single-field equality query on purpose — a second `isMainBooker` filter would
 * require a composite index that does not exist, so ordering is done in memory.
 */
export async function getPartyMembers(
  groupId: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (!groupId) return [];
  const snap = await db
    .collection("bookings")
    .where("groupId", "==", groupId)
    .get();

  return snap.docs.sort((a, b) => {
    const aMain = a.data().isMainBooker === true ? 0 : 1;
    const bMain = b.data().isMainBooker === true ? 0 : 1;
    if (aMain !== bMain) return aMain - bMain;
    return String(a.data().fullName || "").localeCompare(
      String(b.data().fullName || ""),
    );
  });
}

/**
 * Render and send the Reservation Confirmed email for ONE traveller.
 *
 * `partyDocs` is the whole travel party (empty for individual bookings) and is
 * passed in so a group fan-out reads Firestore once, not once per recipient.
 */
export async function sendForBooking(opts: {
  bookingDocumentId: string;
  bookingData: any;
  emailTemplate: string;
  partyDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  gmailService: GmailApiService;
  bccList: string[];
}): Promise<{
  bookingDocumentId: string;
  email: string;
  messageId: string;
  sentEmailLink: string;
  bookingStatusUrl: string;
}> {
  const {
    bookingDocumentId,
    bookingData,
    emailTemplate,
    partyDocs,
    gmailService,
    bccList,
  } = opts;

  const email = bookingData.emailAddress;
  if (!email) {
    throw new Error(`Booking ${bookingDocumentId} has no email address`);
  }
  if (!bookingData.access_token) {
    throw new Error(`Booking ${bookingDocumentId} has no access token`);
  }

  // Each traveller gets their OWN booking-status link and QR code.
  const bookingStatusUrl = buildBookingStatusUrl(bookingData.access_token);

  const qrCodeDataURL = await generateQRCode(bookingStatusUrl);
  const qrCodeBuffer = Buffer.from(qrCodeDataURL.split(",")[1], "base64");

  // This traveller's own money — the reservation fee is split per person, so
  // these stay per-person even when the main booker paid the whole lot.
  const totalCost = memberTotalCost(bookingData);
  const paid = toNumber(bookingData.paid);
  const remainingBalance = totalCost - paid;

  const isGroupBooking = isGroupBookingType(bookingData.bookingType);
  const isMainBooker = bookingData.isMainBooker === true;

  // What THIS recipient actually paid up front: the main booker covered the
  // whole party, a self-paying guest covered only themselves.
  const reservationFeePaid =
    isGroupBooking && isMainBooker
      ? toNumber(
          bookingData.reservationFeePaidTotal ?? bookingData.reservationFee,
        )
      : toNumber(bookingData.reservationFee);

  // "paid by X" only when someone else footed this traveller's fee.
  const reservationFeePaidBy =
    isGroupBooking &&
    !isMainBooker &&
    bookingData.reservationFeePaidByMainBooker !== false
      ? bookingData.mainBookerName || ""
      : "";

  const partyMembers = partyDocs.map((memberDoc) => {
    const member = memberDoc.data();
    const memberCost = memberTotalCost(member);
    const memberPaid = toNumber(member.paid);
    return {
      name: member.fullName || "",
      email: member.emailAddress || "",
      isMainBooker: member.isMainBooker === true,
      isYou: memberDoc.id === bookingDocumentId,
      paymentPlan: member.paymentPlan || "",
      totalCost: memberCost.toFixed(2),
      paid: memberPaid.toFixed(2),
      remainingBalance: (memberCost - memberPaid).toFixed(2),
    };
  });

  const partyTotalCost = partyDocs.reduce(
    (sum, d) => sum + memberTotalCost(d.data()),
    0,
  );
  const partyTotalPaid = partyDocs.reduce(
    (sum, d) => sum + toNumber(d.data().paid),
    0,
  );

  // The main booker sees what the party saves; everyone else their own saving.
  const saleSavings =
    isGroupBooking && isMainBooker && partyDocs.length
      ? partyDocs.reduce((sum, d) => sum + memberSaleSavings(d.data()), 0)
      : memberSaleSavings(bookingData);

  let tourPackageCoverImage = "";
  try {
    const tourPackageSnap = await db
      .collection("tourPackages")
      .where("name", "==", bookingData.tourPackageName)
      .limit(1)
      .get();
    if (!tourPackageSnap.empty) {
      tourPackageCoverImage =
        tourPackageSnap.docs[0].data().media?.coverImage || "";
    }
  } catch (error) {
    logger.warn("Could not fetch tour package for cover image:", error);
  }

  const templateVariables: Record<string, any> = {
    fullName: bookingData.fullName || "",
    tourPackage: bookingData.tourPackageName || "",
    bookingId: bookingData.bookingId || bookingDocumentId,
    tourDate: formatDateLikeSheets(bookingData.tourDate),
    returnDate: formatDateLikeSheets(bookingData.returnDate),
    tourDuration: bookingData.tourDuration || "",
    bookingType: bookingData.bookingType || "",
    paymentPlan: bookingData.paymentPlan || "",
    needsPaymentPlan: !bookingData.paymentPlan,
    saleName: bookingData.saleName || "",
    saleSavings: saleSavings > 0 ? saleSavings.toFixed(2) : "",
    totalCost: totalCost.toFixed(2),
    paid: paid.toFixed(2),
    remainingBalance: remainingBalance.toFixed(2),
    bookingStatusUrl,
    currentYear: new Date().getFullYear(),
    tourPackageCoverImage,
    finalPaymentDeadline: computeFinalPaymentDeadline(bookingData.tourDate),

    // Travel-party context. All false/empty for individual bookings, so the
    // template renders exactly as it did before.
    isGroupBooking,
    isMainBooker,
    groupId: bookingData.groupId || "",
    partySize: partyMembers.length || toNumber(bookingData.groupSize) || 1,
    partyMembers,
    partyTotalCost: partyTotalCost.toFixed(2),
    partyTotalPaid: partyTotalPaid.toFixed(2),
    partyRemainingBalance: (partyTotalCost - partyTotalPaid).toFixed(2),
    reservationFeePaid: reservationFeePaid.toFixed(2),
    reservationFeePaidBy,
  };

  const processedHtml = EmailTemplateService.processTemplate(
    emailTemplate,
    templateVariables,
  );

  // "Reservation Confirmed", not "Booking Confirmed" — the latter is the
  // separate pre-departure-pack email sent once the balance is fully paid.
  const subject = `Reservation Confirmed - ${bookingData.tourPackageName}`;

  const result = await gmailService.sendEmail({
    to: email,
    subject,
    htmlContent: processedHtml,
    bcc: bccList,
    from: "Bella | ImHereTravels <bella@imheretravels.com>",
    attachments: [
      {
        filename: "qrcode.png",
        content: qrCodeBuffer,
        contentType: "image/png",
        cid: "qrcode", // Content ID for inline embedding
      },
    ],
  } as any);

  const sentEmailLink = `https://mail.google.com/mail/u/0/#sent/${result.messageId}`;

  await db.collection("bookings").doc(bookingDocumentId).update({
    bookingStatusEmailSent: true,
    bookingStatusEmailSentAt: Timestamp.now(),
    bookingStatusEmailLink: sentEmailLink,
    lastModified: Timestamp.now(),
  });

  logger.info(
    `✅ Reservation Confirmed email sent to ${email} for ${bookingDocumentId}`,
  );

  return {
    bookingDocumentId,
    email,
    messageId: result.messageId,
    sentEmailLink,
    bookingStatusUrl,
  };
}

const CLAIM_TTL_MS = 5 * 60 * 1000;

/**
 * Claims one traveller's confirmation, so the payment trigger and Step 3 can't
 * both send it. A claim left behind by a run that died expires.
 */
async function claimConfirmation(bookingDocumentId: string): Promise<boolean> {
  const ref = db.collection("bookings").doc(bookingDocumentId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("bookingStatusEmailSent") === true) return false;
    const claimedAt: Timestamp | undefined = snap.get(
      "bookingStatusEmailClaimedAt",
    );
    if (claimedAt && Date.now() - claimedAt.toMillis() < CLAIM_TTL_MS) {
      return false;
    }
    tx.update(ref, { bookingStatusEmailClaimedAt: Timestamp.now() });
    return true;
  });
}

/**
 * Sends the Reservation Confirmed email for a booking, to the whole party when
 * it is the main booker's. Anyone who already has it is skipped.
 */
export async function sendReservationConfirmed(
  bookingDoc: FirebaseFirestore.DocumentSnapshot,
): Promise<{ sent: any[]; failed: any[] }> {
  const bookingData = bookingDoc.data();
  if (!bookingData) {
    throw new HttpsError("not-found", "Booking data is empty");
  }

  // Get email template from Firestore
  logger.info("Loading email template from Firestore...");
  const templateDoc = await db
    .collection("emailTemplates")
    .doc("C8PKdv5BgAlTSFCm6wS3")
    .get();

  if (!templateDoc.exists) {
    throw new HttpsError(
      "not-found",
      "Email template 'Reservation Confirmed' not found",
    );
  }

  const templateData = templateDoc.data();
  if (!templateData) {
    throw new HttpsError("not-found", "Email template data is empty");
  }

  const emailTemplate = templateData.content;
  logger.info("Email template loaded successfully");

  const isGroupBooking = isGroupBookingType(bookingData.bookingType);
  const groupId = bookingData.groupId || "";
  const partyDocs =
    isGroupBooking && groupId ? await getPartyMembers(groupId) : [];

  // Fan out only from the main booker, so a guest confirming their own
  // self-paid booking does not re-mail the whole party.
  const recipients: FirebaseFirestore.DocumentSnapshot[] =
    isGroupBooking && bookingData.isMainBooker === true && partyDocs.length
      ? partyDocs
      : [bookingDoc];

  logger.info(
    `👥 Sending to ${recipients.length} traveller(s) for group "${groupId || "n/a"}"`,
  );

  const gmailService = new GmailApiService();
  const bccList = await getBCCList();

  const sent: any[] = [];
  const failed: any[] = [];

  for (const memberDoc of recipients) {
    const memberData = memberDoc.data() as any;
    if (!(await claimConfirmation(memberDoc.id))) {
      logger.info(`⏭️ ${memberDoc.id} already has its confirmation`);
      continue;
    }
    try {
      sent.push(
        await sendForBooking({
          bookingDocumentId: memberDoc.id,
          bookingData: memberData,
          emailTemplate,
          partyDocs,
          gmailService,
          bccList,
        }),
      );
    } catch (memberError: any) {
      // One traveller failing must not deprive the rest of their email.
      logger.error(
        `❌ Failed to send reservation confirmation for ${memberDoc.id}:`,
        memberError,
      );
      await memberDoc.ref
        .update({ bookingStatusEmailClaimedAt: FieldValue.delete() })
        .catch(() => {});
      failed.push({
        bookingDocumentId: memberDoc.id,
        email: memberData?.emailAddress || "",
        error: memberError?.message || String(memberError),
      });
    }
  }

  return { sent, failed };
}

/**
 * Callable function to send booking status confirmation email with QR code.
 * onReservationPaid sends it straight after the reservation fee is paid; Step 3
 * of /reservation-booking-form calls this as a backstop, and /guest-reservation
 * calls it after step 2. A traveller who already has the email is skipped.
 *
 * For a Duo/Group booking called with the MAIN BOOKER's booking, this fans out
 * to every guest in the party as well — each with their own QR code, payment
 * plan and balance. Guests' addresses are resolved from Firestore, never from
 * the caller. A guest calling in for their own booking sends only to themselves,
 * so the self-pay flow cannot double-send.
 */
export const sendBookingStatusConfirmation = onCall(
  {
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "1GiB",
    cors: true,
  },
  async (request) => {
    try {
      const { bookingDocumentId, email } = request.data;

      if (!bookingDocumentId) {
        throw new HttpsError(
          "invalid-argument",
          "bookingDocumentId is required",
        );
      }

      if (!email) {
        throw new HttpsError("invalid-argument", "email is required");
      }

      logger.info(
        `📧 Sending booking status confirmation for booking: ${bookingDocumentId}`,
      );

      // Get booking data
      const bookingDoc = await db
        .collection("bookings")
        .doc(bookingDocumentId)
        .get();

      if (!bookingDoc.exists) {
        throw new HttpsError("not-found", "Booking not found");
      }

      const bookingData = bookingDoc.data();

      if (!bookingData) {
        throw new HttpsError("not-found", "Booking data is empty");
      }

      // Verify email matches
      if (bookingData.emailAddress !== email) {
        throw new HttpsError(
          "permission-denied",
          "Email does not match booking",
        );
      }

      if (!bookingData.access_token) {
        throw new HttpsError(
          "failed-precondition",
          "Booking access token is missing",
        );
      }

      const { sent, failed } = await sendReservationConfirmed(bookingDoc);

      if (sent.length === 0 && failed.length > 0) {
        throw new HttpsError(
          "internal",
          failed[0]?.error || "Failed to send booking status confirmation",
        );
      }

      // The caller's own booking is always first in `recipients`, so the
      // top-level fields keep the original single-booking response shape.
      const primary =
        sent.find((s) => s.bookingDocumentId === bookingDocumentId) || sent[0];

      return {
        success: true,
        messageId: primary?.messageId ?? null,
        sentEmailLink: primary?.sentEmailLink ?? null,
        bookingStatusUrl: primary?.bookingStatusUrl ?? null,
        recipients: sent,
        failed,
      };
    } catch (error: any) {
      logger.error("❌ Error sending booking status confirmation:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        error.message || "Failed to send booking status confirmation",
      );
    }
  },
);
