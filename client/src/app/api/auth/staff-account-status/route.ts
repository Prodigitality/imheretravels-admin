import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/staff-account-status { email }
 *
 * Staff signup asks whether an account already exists for an email before
 * the visitor is signed in. It used to query `users` from the browser, which
 * handed the whole staff profile to anyone; now the server answers with
 * three flags only, and `users` stays closed to signed-out clients.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || email.length > 320 || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  try {
    const snap = await adminDb().collection("users").where("email", "==", email).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ exists: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const data = snap.docs[0].data() as { hasAgreedToTerms?: boolean; isEmailVerified?: boolean };
    return NextResponse.json(
      { exists: true, hasAgreed: !!data.hasAgreedToTerms, isVerified: !!data.isEmailVerified },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[staff-account-status] lookup failed", error);
    return NextResponse.json({ error: "Failed to check account" }, { status: 500 });
  }
}
