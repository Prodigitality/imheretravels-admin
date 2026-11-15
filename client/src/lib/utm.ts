/**
 * UTM parameters from the visitor's landing URL, saved on reservations (and,
 * from www, on enquiries) so the ad agency can see which campaign a lead came
 * from. Same rules as www/lib/analytics/utm.ts.
 *
 * Shared by the booking form (which captures them) and the API routes (which
 * re-clean whatever the browser sent).
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

const MAX_LENGTH = 150;

/** Keeps only the five UTM keys, as trimmed non-empty strings. Null when none are left. */
export function cleanUtm(input: unknown): Utm | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const value = source[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, MAX_LENGTH);
    if (trimmed) out[key] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : null;
}
