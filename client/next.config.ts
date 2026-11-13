import type { NextConfig } from "next";

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
