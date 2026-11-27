"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Info, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { csvDateStamp, downloadCsv, toCsv } from "@/lib/csv-export";
import type { VisitCounts, WebsiteVisitsDay, WebsiteVisitsReport as Report } from "@/types/website-visits";

/**
 * Website visits report: the www cookie-free visit counter next to GA4, per
 * Manila day. Shared by the staff page (Reports → Website visits) and the
 * agency's private link, which pass their own `load`.
 */

const COUNTER_START = "2026-11-26";

function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const avgSeconds = (c: VisitCounts) => (c.saleTimed ? Math.round(c.saleSeconds / c.saleTimed) : null);
const fmtSeconds = (s: number | null) => (s === null ? "–" : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

export default function WebsiteVisitsReport({
  load,
  aside,
}: {
  load: (start: string, end: string) => Promise<Report>;
  /** Extra content under the controls (the staff page's share card). */
  aside?: ReactNode;
}) {
  const today = manilaToday();
  const [range, setRange] = useState({ start: COUNTER_START, end: today });
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    { label: "Since counting started", start: COUNTER_START, end: today },
    { label: "Today", start: today, end: today },
    { label: "Yesterday", start: addDays(today, -1), end: addDays(today, -1) },
    { label: "Last 7 days", start: addDays(today, -6), end: today },
  ];

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await load(range.start, range.end));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the report");
    } finally {
      setLoading(false);
    }
  }, [load, range.start, range.end]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const chartData = useMemo(
    () =>
      [...(report?.days ?? [])].reverse().map((d) => ({
        label: fmtDay(d.day),
        "Meta ads (counter)": d.meta.saleVisits,
        "Meta ads (GA4)": d.ga4?.metaSale ?? 0,
        "Other visits": d.other.saleVisits,
      })),
    [report],
  );

  const exportCsv = () => {
    if (!report) return;
    const csv = toCsv<WebsiteVisitsDay>(report.days, [
      { header: "Date (Manila)", value: (d) => d.day },
      { header: "Sale page visits from Meta ads (counter)", value: (d) => d.meta.saleVisits },
      { header: "Meta Ads sessions on sale page (GA4)", value: (d) => (d.ga4 ? d.ga4.metaSale : "") },
      { header: "GA4 as % of counter", value: (d) => (d.ga4 ? pct(d.ga4.metaSale, d.meta.saleVisits) : "") },
      { header: "Other sale page visits", value: (d) => d.other.saleVisits },
      { header: "Total sale page visits", value: (d) => d.meta.saleVisits + d.other.saleVisits },
      { header: "Meta visitors who then opened a tour", value: (d) => d.meta.saleThenTour },
      { header: "Avg time on sale page, Meta (seconds)", value: (d) => avgSeconds(d.meta) ?? "" },
      { header: "All site visits", value: (d) => d.meta.visits + d.other.visits },
      { header: "Note", value: (d) => d.note ?? "" },
    ]);
    downloadCsv(`website-visits-${range.start}-to-${range.end}-${csvDateStamp()}.csv`, csv);
  };

  const t = report?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Website visits</h1>
        <p className="text-sm text-muted-foreground">
          Visits to the sale page from the cookie-free counter, next to GA4. Days are in Manila time, the same as the
          Meta ad account.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {presets.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={range.start === p.start && range.end === p.end ? "default" : "outline"}
            onClick={() => setRange({ start: p.start, end: p.end })}
          >
            {p.label}
          </Button>
        ))}
        <div className="flex items-center gap-1">
          <Input
            type="date"
            className="h-9 w-[150px]"
            min={COUNTER_START}
            max={range.end}
            value={range.start}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, start: e.target.value }))}
            aria-label="From"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-9 w-[150px]"
            min={range.start}
            max={today}
            value={range.end}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, end: e.target.value }))}
            aria-label="To"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!report || loading}>
          <Download className="mr-2 h-4 w-4" />
          CSV
        </Button>
      </div>

      {aside}

      {error && (
        <p className="rounded-md border border-crimson-red/30 bg-crimson-red/10 p-3 text-sm text-crimson-red">{error}</p>
      )}

      {report && !report.ga4.connected && (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>GA4 column: {report.ga4.reason}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { title: "Sale page visits from Meta ads", value: t?.meta.saleVisits, hint: "Cookie-free counter" },
          { title: "Other sale page visits", value: t?.other.saleVisits, hint: "Other or no UTM source" },
          { title: "Meta visitors who opened a tour", value: t?.meta.saleThenTour, hint: "After the sale page" },
          { title: "Avg time on sale page", value: t ? fmtSeconds(avgSeconds(t.meta)) : undefined, hint: "Meta ad visitors" },
          {
            title: "GA4 Meta Ads sessions",
            value: t?.ga4 ? t.ga4.metaSale : report ? "–" : undefined,
            hint: "Only visitors who accepted cookies",
          },
        ].map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !report ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div className="text-2xl font-bold">{card.value ?? "–"}</div>
              )}
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sale page visits per day</CardTitle>
          <CardDescription>Meta ad visits from the counter, GA4&apos;s Meta Ads sessions, and other visits</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Meta ads (counter)" fill="#EF3340" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Meta ads (GA4)" fill="#FF585D" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Other visits" fill="#959595" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-[260px] w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By day</CardTitle>
          <CardDescription>Newest first. Manila time.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 text-right font-medium">Meta ads (counter)</th>
                <th className="py-2 pr-3 text-right font-medium">Meta ads (GA4)</th>
                <th className="py-2 pr-3 text-right font-medium">GA4 vs counter</th>
                <th className="py-2 pr-3 text-right font-medium">Other visits</th>
                <th className="py-2 pr-3 text-right font-medium">Total sale page</th>
                <th className="py-2 pr-3 text-right font-medium">Meta → tour page</th>
                <th className="py-2 text-right font-medium">Avg time (Meta)</th>
              </tr>
            </thead>
            <tbody>
              {(report?.days ?? []).map((d) => (
                <tr key={d.day} className="border-b align-top last:border-0">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{fmtDay(d.day)}</div>
                    {d.note && <div className="max-w-[260px] text-xs text-muted-foreground">{d.note}</div>}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold">{d.meta.saleVisits}</td>
                  <td className="py-2 pr-3 text-right">{d.ga4 ? d.ga4.metaSale : "–"}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">
                    {d.ga4 ? pct(d.ga4.metaSale, d.meta.saleVisits) : "–"}
                  </td>
                  <td className="py-2 pr-3 text-right">{d.other.saleVisits}</td>
                  <td className="py-2 pr-3 text-right">{d.meta.saleVisits + d.other.saleVisits}</td>
                  <td className="py-2 pr-3 text-right">{d.meta.saleThenTour}</td>
                  <td className="py-2 text-right">{fmtSeconds(avgSeconds(d.meta))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By source and campaign</CardTitle>
          <CardDescription>From the UTM tags on the link each visitor arrived with</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Campaign</th>
                <th className="py-2 pr-3 text-right font-medium">Sale page visits</th>
                <th className="py-2 pr-3 text-right font-medium">Then opened a tour</th>
                <th className="py-2 pr-3 text-right font-medium">Avg time</th>
                <th className="py-2 text-right font-medium">All site visits</th>
              </tr>
            </thead>
            <tbody>
              {(report?.campaigns ?? []).map((c) => (
                <tr key={`${c.source}\n${c.campaign}`} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{c.source === "(none)" ? "No UTM" : c.source}</td>
                  <td className="py-2 pr-3">{c.campaign === "(none)" ? "–" : c.campaign}</td>
                  <td className="py-2 pr-3 text-right">{c.counts.saleVisits}</td>
                  <td className="py-2 pr-3 text-right">{c.counts.saleThenTour}</td>
                  <td className="py-2 pr-3 text-right">{fmtSeconds(avgSeconds(c.counts))}</td>
                  <td className="py-2 text-right">{c.counts.visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How these numbers work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Counter:</strong> counts every visit, whatever the visitor chooses in
            the cookie banner. It sets no cookies and keeps only totals. A visit is one page load, so a reload counts
            again. A visit is &ldquo;from Meta ads&rdquo; when it arrived on a link tagged utm_source=meta. Counting
            started on 26 Nov 2026.
          </p>
          <p>
            <strong className="text-foreground">GA4:</strong> Meta Ads sessions that landed on the sale page. GA4 only
            sees visitors who accepted cookies, so it will normally be lower than the counter.
          </p>
          <p>
            <strong className="text-foreground">Days:</strong> Manila time, matching the Meta ad account and GA4.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
