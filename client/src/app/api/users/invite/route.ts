import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/require-admin";
import { adminDb } from "@/lib/firebase-admin-db";
import { getFirebaseAdminAuth } from "@/lib/firebase-admin-auth";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { createInitialColumnsMetadata } from "@/lib/columns-metadata";
import { VIEWER_PERMISSIONS } from "@/lib/viewer-access";
import { buildInviteEmail } from "@/lib/staff-invite-email";
import type { UserPermissions } from "@/types/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_BASE_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL || "https://admin.imheretravels.com";
const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

const NO_PERMISSIONS: UserPermissions = {
  canManageBookings: false,
  canManageTours: false,
  canManageTemplates: false,
  canManageUsers: false,
  canManagePaymentTypes: false,
  canManageStorage: false,
  canManageFunctions: false,
  canManageEmails: false,
  canManageBcc: false,
};

/**
 * POST /api/users/invite (admins only): creates a staff account for someone
 * and emails them a link to set their own password; nobody else ever sees it.
 * Then they finish the usual sign-up (name + terms) with that password, and
 * the account is already approved with the role chosen here. Calling it again
 * for an account that hasn't finished sign-up re-sends the invite.
 *
 * Body: { email, firstName?, lastName?, role: "viewer" | "agent" }.
 * A viewer gets VIEWER_PERMISSIONS (lib/viewer-access.ts); an agent starts
 * with none, to be switched on in User Management.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get("authorization"));
  if (!admin.ok) return NextResponse.json({ success: false, error: admin.error }, { status: admin.status });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim().slice(0, 60) : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim().slice(0, 60) : "";
  const role = body?.role === "agent" ? "agent" : body?.role === "viewer" ? "viewer" : null;
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 });
  }
  if (!role) return NextResponse.json({ success: false, error: "Choose Viewer or Agent" }, { status: 400 });

  const auth = getFirebaseAdminAuth();
  const db = adminDb();
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email).catch((e: { code?: string }) => {
      if (e?.code === "auth/user-not-found") return null;
      throw e;
    });
    if (existing) {
      const doc = await db.collection("users").doc(existing.uid).get();
      if (doc.exists && doc.get("hasAgreedToTerms") === true) {
        return NextResponse.json(
          { success: false, error: "This person already has an account. Change their role in the list instead." },
          { status: 409 },
        );
      }
      uid = existing.uid;
    } else {
      const displayName = `${firstName} ${lastName}`.trim();
      // emailVerified: they can only set a password through the link sent to
      // this inbox, which proves they own it; sign-up then skips its own check.
      uid = (await auth.createUser({ email, emailVerified: true, ...(displayName ? { displayName } : {}) })).uid;
    }

    await db.collection("users").doc(uid).set(
      {
        id: uid,
        email,
        role,
        profile: {
          firstName,
          lastName,
          avatar: `https://api.dicebear.com/8.x/pixel-art/svg?seed=${encodeURIComponent(email)}`,
          timezone: "Europe/London",
        },
        permissions: role === "viewer" ? VIEWER_PERMISSIONS : NO_PERMISSIONS,
        preferences: {
          notifications: { newBookings: false, payments: false, cancellations: false },
          columnsMetadata: createInitialColumnsMetadata(),
        },
        security: { lastLogin: null, lastPasswordReset: null, twoFactorEnabled: false },
        metadata: { createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), isActive: true },
        isApproved: true,
        hasAgreedToTerms: false,
        isEmailVerified: true,
        invitedAt: FieldValue.serverTimestamp(),
        invitedBy: admin.uid,
      },
      { merge: true },
    );
  } catch (e) {
    console.error("[users/invite] account setup failed", e);
    return NextResponse.json({ success: false, error: "Couldn't create the account" }, { status: 500 });
  }

  try {
    const link = await auth.generatePasswordResetLink(email, { url: `${ADMIN_BASE_URL}/auth/admin/signup` });
    const inviter = await db.collection("users").doc(admin.uid).get();
    const inviterName = [inviter.get("profile.firstName"), inviter.get("profile.lastName")].filter(Boolean).join(" ") || "The I'm Here Travels team";
    const { subject, html } = buildInviteEmail({ firstName, role, inviterName, setPasswordUrl: link, signupUrl: `${ADMIN_BASE_URL}/auth/admin/signup` });
    await new GmailApiService().sendEmail({ to: email, subject, htmlContent: html, from: "Bella | I'm Here Travels <bella@imheretravels.com>" });
  } catch (e) {
    console.error("[users/invite] invite email failed", e);
    return NextResponse.json(
      { success: false, uid, error: "The account is ready, but the invite email couldn't be sent. Try \"Resend invite\"." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, uid });
}
