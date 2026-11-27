/**
 * Website visits report: the www cookie-free visit counter (Firestore
 * `siteVisitStats`) next to GA4's Meta Ads sessions. Days are Manila dates,
 * the time zone of the Meta ad account and of GA4.
 */

export interface VisitCounts {
  /** Page loads on any page. */
  visits: number;
  /** Visits that viewed the sale page. */
  saleVisits: number;
  /** Of those, visits that went on to open a tour page. */
  saleThenTour: number;
  /** Seconds on the sale page, summed; average = saleSeconds / saleTimed. */
  saleSeconds: number;
  saleTimed: number;
}

export interface Ga4DayCounts {
  /** GA4 Meta Ads sessions that landed on the sale page. */
  metaSale: number;
  /** All GA4 Meta Ads sessions. */
  metaAll: number;
}

export interface WebsiteVisitsDay {
  /** Manila date, YYYY-MM-DD. */
  day: string;
  /** Visits from the Meta ads (utm_source=meta). */
  meta: VisitCounts;
  /** Every other visit (other or no UTM source). */
  other: VisitCounts;
  /** GA4 for the same day; null when GA4 isn't connected. */
  ga4: Ga4DayCounts | null;
  /** Explains a day that isn't a full Manila day. */
  note?: string;
}

export interface WebsiteVisitsCampaign {
  source: string;
  campaign: string;
  counts: VisitCounts;
}

export interface WebsiteVisitsReport {
  start: string;
  end: string;
  /** First day the counter has data for. */
  counterStart: string;
  days: WebsiteVisitsDay[];
  campaigns: WebsiteVisitsCampaign[];
  totals: { meta: VisitCounts; other: VisitCounts; ga4: Ga4DayCounts | null };
  ga4: { connected: boolean; reason?: string };
  generatedAt: string;
}
