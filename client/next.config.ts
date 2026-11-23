import type { NextConfig } from "next";

// Safeguard: without NEXT_PUBLIC_GTM_ID the public booking form ships with no
// Tag Manager, no cookie banner and no Meta pixel (no InitiateCheckout or
// Purchase for the ads), and nothing else looks wrong. That happened after the
// hosting move on 2026-11-23. Fail production builds on Vercel instead, so the
// live site stays on the previous deployment. Local and preview builds are
// unaffected.
if (
  process.env.VERCEL_ENV === "production" &&
  !/^GTM-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GTM_ID ?? "")
) {
  throw new Error(
    "Production build stopped: NEXT_PUBLIC_GTM_ID is missing or invalid. " +
      "Add it in Vercel (Settings > Environment Variables > Production) and redeploy. " +
      "Without it the booking form has no Tag Manager, cookie banner or Meta pixel.",
  );
}

const nextConfig: NextConfig = {
  // Pin the workspace root to this app dir so Next doesn't infer it from a
  // sibling lockfile (admin/package-lock.json).
  turbopack: {
    root: __dirname,
  },
  // /reservation-booking-form/booking-confirmed is the form's address after the
  // reservation fee is paid (see utils/bookingConfirmedUrl.ts). In-app (RSC)
  // requests render the form; a full page load goes back to the plain form
  // URL, so a refresh doesn't count the booking again. Query strings carry over.
  async redirects() {
    return [
      {
        source: "/reservation-booking-form/booking-confirmed",
        missing: [{ type: "header", key: "rsc" }],
        destination: "/reservation-booking-form",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/reservation-booking-form/booking-confirmed",
        destination: "/reservation-booking-form",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "slemvconhlqgxarzfwzk.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: "/v0/b/**/o/**",
      },
      {
        protocol: "https",
        hostname: "*.firebasestorage.app",
        port: "",
        pathname: "/o/**",
      },
      {
        protocol: "https",
        hostname: "**",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "**",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
