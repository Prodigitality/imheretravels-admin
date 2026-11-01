import { NextRequest } from "next/server";
import { clearPaying, markPaying } from "@/lib/sale/holds";
import { errorResponse, json, preflight } from "@/lib/sale/http";

/** Public: POST when the customer presses Pay (locks the slots), DELETE when that payment fails. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const token = req.headers.get("x-hold-token") ?? "";
  try {
    return json(req, { hold: await markPaying(holdId, token) });
  } catch (e) {
    return errorResponse(req, e, "mark paying");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const token = req.headers.get("x-hold-token") ?? "";
  try {
    return json(req, { hold: await clearPaying(holdId, token) });
  } catch (e) {
    return errorResponse(req, e, "clear paying");
  }
}
