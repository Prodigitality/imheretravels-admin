import "server-only";

import { adminDb } from "@/lib/firebase-admin-db";
import { getGa4MetaSessions } from "@/lib/ga4-server";
import type {
  Ga4DayCounts,
  VisitCounts,
  WebsiteVisitsCampaign,
  WebsiteVisitsDay,
  WebsiteVisitsReport,
} from "@/types/website-visits";

/**
 * Builds the Website visits report from www's cookie-free counter
 * (`siteVisitStats`, written by www app/api/visit/route.ts) plus GA4.
 *
 * Since 27 Nov 2026 each doc is one UTC hour with `day` = the Manila date.
 * The two docs days before that were grouped by UK day; see DAY_NOTES.
 */

const COLLECTION = "siteVisitStats";
export const COUNTER_START = "2026-11-26";
const META_SOURCE = "meta";
const IGNORED_SOURCES = new Set(["claude-test"]);
const MAX_DAYS = 366;

const DAY_NOTES: Record<string, string> = {
  "2026-11-26":
    "Counting started at about 3:15 pm. This row also includes 27 Nov from midnight to 8 am, which can't be separated.",
  "2026-11-27": "From 8 am (midnight to 8 am is in the 26 Nov row).",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const zero = (): VisitCounts => ({ visits: 0, saleVisits: 0, saleThenTour: 0, saleSeconds: 0, saleTimed: 0 });

function add(into: VisitCounts, from: Partial<VisitCounts>) {
  into.visits += from.visits ?? 0;
  into.saleVisits += from.saleVisits ?? 0;
  into.saleThenTour += from.saleThenTour ?? 0;
  into.saleSeconds += from.saleSeconds ?? 0;
  into.saleTimed += from.saleTimed ?? 0;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export class ReportRangeError extends Error {}

/** Clamp and validate a requested range (Manila dates, inclusive). */
export function normaliseRange(startRaw: string | null, endRaw: string | null): { start: string; end: string } {
  const today = manilaToday();
  let start = startRaw && DATE.test(startRaw) ? startRaw : COUNTER_START;
  let end = endRaw && DATE.test(endRaw) ? endRaw : today;
  if (end > today) end = today;
  if (start > end) throw new ReportRangeError("The start date is after the end date.");
  if (start < addDays(end, -MAX_DAYS)) start = addDays(end, -MAX_DAYS);
  return { start, end };
}

export async function getWebsiteVisitsReport(start: string, end: string): Promise<WebsiteVisitsReport> {
  const [snap, ga4] = await Promise.all([
    adminDb().collection(COLLECTION).where("day", ">=", start).where("day", "<=", end).get(),
    getGa4MetaSessions(start, end),
  ]);

  const byDay = new Map<string, { meta: VisitCounts; other: VisitCounts }>();
  const byCampaign = new Map<string, WebsiteVisitsCampaign>();

  for (const doc of snap.docs) {
    const d = doc.data();
    const source = typeof d.source === "string" ? d.source : "(none)";
    if (IGNORED_SOURCES.has(source)) continue;
    const campaign = typeof d.campaign === "string" ? d.campaign : "(none)";
    const counts: VisitCounts = {
      visits: num(d.visits),
      saleVisits: num(d.saleVisits),
      saleThenTour: num(d.saleThenTour),
      saleSeconds: num(d.saleSeconds),
      saleTimed: num(d.saleTimed),
    };

    const day = String(d.day);
    const entry = byDay.get(day) ?? { meta: zero(), other: zero() };
    add(source === META_SOURCE ? entry.meta : entry.other, counts);
    byDay.set(day, entry);

    const key = `${source}\n${campaign}`;
    const c = byCampaign.get(key) ?? { source, campaign, counts: zero() };
    add(c.counts, counts);
    byCampaign.set(key, c);
  }

  // One row per day from the counter's first day, zeros included.
  const first = start < COUNTER_START ? COUNTER_START : start;
  const days: WebsiteVisitsDay[] = [];
  for (let day = first; day <= end; day = addDays(day, 1)) {
    const entry = byDay.get(day) ?? { meta: zero(), other: zero() };
    days.push({
      day,
      ...entry,
      ga4: ga4.connected ? (ga4.byDay[day] ?? { metaSale: 0, metaAll: 0 }) : null,
      ...(DAY_NOTES[day] ? { note: DAY_NOTES[day] } : {}),
    });
  }

  const totals = { meta: zero(), other: zero(), ga4: ga4.connected ? { metaSale: 0, metaAll: 0 } : null } as {
    meta: VisitCounts;
    other: VisitCounts;
    ga4: Ga4DayCounts | null;
  };
  for (const d of days) {
    add(totals.meta, d.meta);
    add(totals.other, d.other);
    if (totals.ga4 && d.ga4) {
      totals.ga4.metaSale += d.ga4.metaSale;
      totals.ga4.metaAll += d.ga4.metaAll;
    }
  }

  return {
    start,
    end,
    counterStart: COUNTER_START,
    days: days.reverse(), // newest first
    campaigns: [...byCampaign.values()].sort(
      (a, b) => b.counts.saleVisits - a.counts.saleVisits || b.counts.visits - a.counts.visits,
    ),
    totals,
    ga4: ga4.connected ? { connected: true } : { connected: false, reason: ga4.reason },
    generatedAt: new Date().toISOString(),
  };
}
