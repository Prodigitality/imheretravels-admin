import { CONSENT_COOKIE } from "@/lib/consent";
import { cleanUtm, UTM_KEYS, type Utm } from "@/lib/utm";

/**
 * UTMs for the booking form. They arrive in the form's URL, either from an ad
 * that links straight here or from www, which adds the visit's UTMs to its
 * booking-form links.
 *
 * Read when this module first loads, before the form's effects rewrite the URL
 * (useReservationUrlSync rebuilds the query string). Kept in memory, and in
 * sessionStorage (so a Stripe redirect back to the form keeps them) only when
 * the visitor has accepted cookies.
 */

const STORAGE_KEY = "iht_utm";

let captured: Utm | null = null;

function hasConsent(): boolean {
  try {
    return document.cookie.split("; ").includes(`${CONSENT_COOKIE}=granted`);
  } catch {
    return false;
  }
}

function captureFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = cleanUtm(Object.fromEntries(UTM_KEYS.map((key) => [key, params.get(key)])));
  if (!fromUrl) return;
  captured = fromUrl;
  if (!hasConsent()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
  } catch {
    // Storage blocked: memory still has them.
  }
}

if (typeof window !== "undefined") captureFromUrl();

/** The visit's UTMs, or null for a visitor who didn't arrive from a tagged link. */
export function getUtm(): Utm | null {
  if (typeof window === "undefined") return null;
  if (captured) return captured;
  try {
    if (!hasConsent()) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? cleanUtm(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}
