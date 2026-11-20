import { NextRequest, after } from "next/server";
import { z } from "zod";
import { claimSlots } from "@/lib/sale/holds";
import { MAX_PARTY_SIZE, MAX_SLOTS } from "@/lib/sale/slots";
import { SALE_LIMITS, clientIp, errorResponse, json, preflight, rateLimit } from "@/lib/sale/http";
import { cleanUtm } from "@/lib/utm";
import { emailTeamAboutHold } from "@/lib/team-notify-emails";

/**
 * Public: holds the next free slots of a sale tour for one customer. The
 * www sale page calls this cross-origin; the response carries the hold link
 * token, which is the only way to act on the hold afterwards. Once the
 * response is sent, the team gets an email about the hold (with the visit's
 * UTMs).
 */
const Body = z.object({
  saleId: z.string().min(1).max(128).regex(/^[^/]+$/),
  tourPackageId: z.string().min(1).max(128).regex(/^[^/]+$/),
  partySize: z.number().int().min(1).max(MAX_PARTY_SIZE),
  email: z.string().trim().email().max(254),
  /** Slots on screen when Hold was tapped; if one has gone the claim is refused so the new price can be shown. */
  shownSlots: z.array(z.number().int().min(1).max(MAX_SLOTS)).max(MAX_PARTY_SIZE).optional(),
  /** The visit's landing-page UTMs; cleaned by cleanUtm, anything odd is dropped. */
  utm: z.unknown().optional(),
  /** Honeypot: real visitors never fill this. */
  website: z.string().max(0).optional(),
});

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "invalid_request" }, { status: 400 });

  try {
    await rateLimit(SALE_LIMITS.claimPerIp, clientIp(req));
    await rateLimit(SALE_LIMITS.claimPerEmail, parsed.data.email.toLowerCase());
    const utm = cleanUtm(parsed.data.utm);
    const { utm: _raw, ...input } = parsed.data;
    const hold = await claimSlots({ ...input, utm });
    // After the response, so the customer isn't kept waiting on Gmail.
    after(() => emailTeamAboutHold(hold, parsed.data.email.trim().toLowerCase(), utm));
    return json(req, { hold, holdParam: `${hold.holdId}.${hold.token}` });
  } catch (e) {
    return errorResponse(req, e, "claim");
  }
}
