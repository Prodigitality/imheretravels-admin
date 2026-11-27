import "server-only";

import { google } from "googleapis";
import type { Ga4DayCounts } from "@/types/website-visits";

/**
 * GA4 Meta Ads sessions per day, for the Website visits report.
 *
 * Reads the GA4 Data API with admin's Firebase service account
 * (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY), which must be added as a
 * Viewer on the GA4 property, with the Analytics Data API enabled on the
 * Google Cloud project. GA4_PROPERTY_ID is the numeric property id.
 *
 * GA4 only sees visitors who accepted cookies, so these numbers are a floor.
 * Days come back in the property's time zone (Manila).
 */

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const SALE_LANDING = /^\/black-friday/;
const CACHE_MS = 10 * 60 * 1000;

export type Ga4Result =
  | { connected: true; byDay: Record<string, Ga4DayCounts> }
  | { connected: false; reason: string };

const cache = new Map<string, { at: number; value: Ga4Result }>();

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
    return "The Google Analytics Data API isn't enabled on the Google Cloud project yet.";
  }
  if (/permission|403|does not have sufficient/i.test(message)) {
    return "Admin's service account doesn't have access to the GA4 property yet.";
  }
  return `GA4 couldn't be read (${message.slice(0, 160)}).`;
}

export async function getGa4MetaSessions(start: string, end: string): Promise<Ga4Result> {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!propertyId || !email || !key) {
    return { connected: false, reason: "GA4 isn't connected yet." };
  }

  const cacheKey = `${propertyId}:${start}:${end}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  try {
    const auth = new google.auth.JWT({ email, key, scopes: [SCOPE] });
    const analytics = google.analyticsdata({ version: "v1beta", auth });
    const res = await analytics.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: [{ name: "date" }, { name: "landingPage" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionSourcePlatform",
            stringFilter: { matchType: "EXACT", value: "Meta Ads" },
          },
        },
        limit: "10000",
      },
    });

    const byDay: Record<string, Ga4DayCounts> = {};
    for (const row of res.data.rows ?? []) {
      const raw = row.dimensionValues?.[0]?.value ?? "";
      const landing = row.dimensionValues?.[1]?.value ?? "";
      const sessions = Number(row.metricValues?.[0]?.value ?? 0) || 0;
      if (!/^\d{8}$/.test(raw)) continue;
      const day = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      const counts = (byDay[day] ??= { metaSale: 0, metaAll: 0 });
      counts.metaAll += sessions;
      if (SALE_LANDING.test(landing)) counts.metaSale += sessions;
    }

    const value: Ga4Result = { connected: true, byDay };
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error("[ga4] report failed", error);
    return { connected: false, reason: explain(error) };
  }
}
