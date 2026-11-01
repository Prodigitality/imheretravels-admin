import { NextRequest } from "next/server";
import { markLeaving, markReturned } from "@/lib/sale/holds";
import { errorResponse, json, preflight } from "@/lib/sale/http";

/** Public: POST when the hold's page closes or refreshes, DELETE when it comes back. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const token = req.headers.get("x-hold-token") ?? "";
  try {
    await markLeaving(holdId, token);
    return json(req, { ok: true });
  } catch (e) {
    return errorResponse(req, e, "mark leaving");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const token = req.headers.get("x-hold-token") ?? "";
  try {
    return json(req, { hold: await markReturned(holdId, token) });
  } catch (e) {
    return errorResponse(req, e, "mark returned");
  }
}
