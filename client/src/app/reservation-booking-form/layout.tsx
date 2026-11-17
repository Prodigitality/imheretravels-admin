import ConsentModeDefault from "@/components/analytics/ConsentModeDefault";
import GoogleTagManager, {
  GoogleTagManagerNoScript,
} from "@/components/analytics/GoogleTagManager";
import ConsentBanner from "@/components/analytics/ConsentBanner";
import CookieSettingsToggle from "@/components/analytics/CookieSettingsToggle";
import type { Metadata } from "next";

// Customer-facing: replaces the root layout's "Admin Dashboard" title, which
// customers saw in the browser tab and GA4 reported as the page title.
const TITLE = "Book Your Tour — I'm Here Travels";
const DESCRIPTION =
  "Reserve your place on an I'm Here Travels small-group tour: choose your date, pay the reservation fee and pick a payment plan.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "I'm Here Travels",
    title: TITLE,
    description: DESCRIPTION,
    url: "https://admin.imheretravels.com/reservation-booking-form",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * Route-scoped layout — analytics + consent are wired here, not in the shared app root
 * layout, so they apply ONLY to this public, guest-facing booking form. Every other admin
 * route (dashboard, bookings, tours, etc.) is internal-only and stays untagged.
 *
 * This is a nested layout, not the app root, so it has no `<head>` to render into the way
 * `www`'s equivalent setup does. That's fine: `ConsentModeDefault` is a synchronous script
 * that runs at parse time regardless of DOM position, and `GoogleTagManager` uses
 * `afterInteractive` (inherently later) — so the required ordering (consent defaults before
 * GTM) holds without needing `<head>` placement.
 */
export default function ReservationBookingFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ConsentModeDefault />
      <GoogleTagManagerNoScript />
      <GoogleTagManager />
      {children}
      <ConsentBanner />
      <CookieSettingsToggle />
    </>
  );
}
