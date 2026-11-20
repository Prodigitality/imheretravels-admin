"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ExternalLink, FlaskConical, Inbox, Loader2, Mail, MailSearch, MessageCircle, Phone, RefreshCw, Search } from "lucide-react";
import { gmailComposeUrl, gmailLeadSearchUrl } from "@/lib/gmail-links";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { staffFetch } from "@/lib/staff-fetch";
import { cn } from "@/lib/utils";
import { isTestEnquiry, looksLikeTest } from "@/lib/enquiry-test";
import {
  ENQUIRY_FORM_LABELS,
  ENQUIRY_LOCATION_LABELS,
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  type Enquiry,
  type EnquiryStatus,
} from "@/types/enquiries";

// No `dark:` variants (see PartnershipsList): admin has no darkMode setting.
const STATUS_STYLES: Record<EnquiryStatus, { badge: string; dot: string }> = {
  new: { badge: "bg-[#FDECEE] text-[#B4232F] border-[#F7C4C9]", dot: "bg-[#EF3340]" },
  contacted: { badge: "bg-[#E6F0FF] text-[#1D4ED8] border-[#BFD5FB]", dot: "bg-[#2563EB]" },
  booked: { badge: "bg-[#E3F8EC] text-[#11703F] border-[#B5E8CB]", dot: "bg-[#16A34A]" },
  closed: { badge: "bg-[#F1F1F1] text-[#505050] border-[#DADADA]", dot: "bg-[#959595]" },
};

const TH = "px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const TD = "px-4 py-3.5 align-middle";
const WWW = "https://www.imheretravels.com";
/** Tour filter value for messages from the /contact-us form. */
const CONTACT_FILTER = "__contact_form";

/** Test submissions (lib/enquiry-test) are hidden unless asked for. */
type TestFilter = "hide" | "only" | "all";
const TEST_FILTER_LABELS: Record<TestFilter, string> = {
  hide: "Hide tests",
  only: "Only tests",
  all: "Include tests",
};

function TestBadge() {
  return (
    <Badge variant="outline" className="shrink-0 gap-1 rounded-full border-[#DADADA] bg-[#F1F1F1] px-2 py-0 text-[11px] font-medium text-[#505050]">
      <FlaskConical className="size-3" aria-hidden="true" />
      Test
    </Badge>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Saved numbers are E.164 (+447911123456); shown spaced, as typed for older leads. */
function formatPhone(phone: string): string {
  if (!phone.startsWith("+")) return phone;
  return parsePhoneNumberFromString(phone)?.formatInternational() ?? phone;
}

/** wa.me needs the number with country code and digits only. */
function whatsappUrl(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

function StatusBadge({ status }: { status: EnquiryStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-medium", STATUS_STYLES[status].badge)}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_STYLES[status].dot)} aria-hidden="true" />
      {ENQUIRY_STATUS_LABELS[status]}
    </Badge>
  );
}

export default function EnquiriesList() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<EnquiryStatus | "all">("all");
  const [tour, setTour] = useState<string>("all");
  const [tests, setTests] = useState<TestFilter>("hide");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await staffFetch("/api/enquiries");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      setItems(json.data as Enquiry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load enquiries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tours = useMemo(() => {
    const names = new Set<string>();
    for (const e of items) if (e.tour?.name) names.add(e.tour.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const testCount = useMemo(() => items.filter(isTestEnquiry).length, [items]);
  const fresh = useMemo(() => items.filter((e) => e.status === "new" && !isTestEnquiry(e)).length, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((e) => {
      if (tests !== "all" && isTestEnquiry(e) !== (tests === "only")) return false;
      if (status !== "all" && e.status !== status) return false;
      if (tour === CONTACT_FILTER ? e.form !== "contact_us" : tour !== "all" && e.tour?.name !== tour) return false;
      if (!q) return true;
      return [e.name, e.email, e.phone, e.message, e.tour?.name ?? ""].join(" ").toLowerCase().includes(q);
    });
  }, [items, status, tour, query, tests]);
  const filtersOn = status !== "all" || tour !== "all" || tests !== "hide" || !!query;

  const selected = items.find((e) => e.id === selectedId) ?? null;

  function openDetail(id: string | null) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("id", id);
    else params.delete("id");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function replaceItem(updated: Enquiry) {
    setItems((list) => list.map((e) => (e.id === updated.id ? updated : e)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length - testCount} {items.length - testCount === 1 ? "enquiry" : "enquiries"}
          {fresh > 0 && (
            <span className="ml-2 rounded-full bg-crimson-red px-2 py-0.5 text-xs text-white">{fresh} new</span>
          )}
          {testCount > 0 && (
            <span className="ml-2 text-xs">
              (+{testCount} test{testCount === 1 ? "" : "s"})
            </span>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, phone, message…"
              className="pl-9 sm:w-72"
            />
          </div>
          <Select value={tour} onValueChange={setTour}>
            <SelectTrigger className="sm:w-56" aria-label="Tour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tours</SelectItem>
              <SelectItem value={CONTACT_FILTER}>Contact form</SelectItem>
              {tours.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as EnquiryStatus | "all")}>
            <SelectTrigger className="sm:w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ENQUIRY_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ENQUIRY_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tests} onValueChange={(v) => setTests(v as TestFilter)}>
            <SelectTrigger className="sm:w-40" aria-label="Test submissions">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TEST_FILTER_LABELS) as TestFilter[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TEST_FILTER_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table className="table-fixed">
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(TH, "w-[45%] md:w-[32%]")}>Name</TableHead>
              <TableHead className={cn(TH, "hidden md:table-cell md:w-[26%]")}>Tour</TableHead>
              <TableHead className={cn(TH, "hidden lg:table-cell lg:w-[16%]")}>Phone</TableHead>
              <TableHead className={cn(TH, "hidden sm:table-cell sm:w-[14%]")}>Received</TableHead>
              <TableHead className={cn(TH, "w-[120px]")}>Status</TableHead>
              <TableHead className="w-10" aria-hidden="true" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="px-4 py-16 text-center">
                  <Inbox className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {filtersOn ? "No enquiries match these filters" : "No enquiries yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {filtersOn
                      ? "Try clearing the search or filters."
                      : "Enquiries from the Inquire now buttons and the Contact us form on imheretravels.com appear here."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => {
                const isTest = isTestEnquiry(e);
                const isNew = e.status === "new" && !isTest;
                return (
                  <TableRow
                    key={e.id}
                    className={cn(
                      "group cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none",
                      selectedId === e.id && "bg-muted/60",
                    )}
                    onClick={() => openDetail(e.id)}
                    tabIndex={0}
                    aria-label={`Open enquiry from ${e.name}`}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        openDetail(e.id);
                      }
                    }}
                  >
                    <TableCell className={TD}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative shrink-0">
                          <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                            {initials(e.name)}
                          </div>
                          {isNew && (
                            <span
                              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-[#EF3340]"
                              aria-label="New"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className={cn("truncate text-sm text-foreground", isNew ? "font-semibold" : "font-medium")}>
                              {e.name}
                            </p>
                            {isTest && <TestBadge />}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={cn(TD, "hidden md:table-cell")}>
                      <p className={cn("truncate text-sm", e.form === "contact_us" ? "text-muted-foreground" : "text-foreground")}>
                        {e.form === "contact_us" ? "Contact form" : e.tour?.name || "—"}
                      </p>
                      {e.message && <p className="truncate text-xs text-muted-foreground">{e.message}</p>}
                    </TableCell>
                    <TableCell className={cn(TD, "hidden truncate text-sm lg:table-cell")}>{e.phone ? formatPhone(e.phone) : "—"}</TableCell>
                    <TableCell className={cn(TD, "hidden whitespace-nowrap sm:table-cell")}>
                      <span className="text-sm text-foreground" title={fmtDate(e.createdAt)}>
                        {relativeTime(e.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className={TD}>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <ChevronRight
                        className="ml-auto size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {!loading && filtered.length > 0 && (
          <div className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} enquiries{tests === "hide" && testCount > 0 ? ` (${testCount} test${testCount === 1 ? "" : "s"} hidden)` : ""}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && openDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selected && <EnquiryDetail item={selected} onUpdated={replaceItem} toast={toast} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EnquiryDetail({
  item,
  onUpdated,
  toast,
}: {
  item: Enquiry;
  onUpdated: (e: Enquiry) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  async function patch(body: { status?: EnquiryStatus; note?: string; test?: boolean | null }) {
    setSaving(true);
    try {
      const res = await staffFetch(`/api/enquiries/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      onUpdated(json.data as Enquiry);
      return true;
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  // "View in Gmail" finds the emails the website sent for this enquiry (the
  // customer's receipt carries its id), so a reply stays in that thread.
  // "New email" is a fresh Gmail compose (mailto: needs a desktop mail app).
  const viewUrl = gmailLeadSearchUrl(item.id, item.email);
  const replyUrl = gmailComposeUrl(
    item.email,
    item.tour?.name ? `Your enquiry about ${item.tour.name}` : "Your message to I'm Here Travels",
    `Hi ${item.name.split(/\s+/)[0] || ""},\n\n`,
  );
  const wa = whatsappUrl(item.phone);
  const isTest = isTestEnquiry(item);
  const auto = looksLikeTest(item);

  const rows: [string, React.ReactNode][] = [
    [
      "Tour",
      item.tour?.slug ? (
        <a href={`${WWW}/tours/${item.tour.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-crimson-red underline">
          {item.tour.name || item.tour.slug}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : (
        item.tour?.name || "—"
      ),
    ],
    ["Email", item.email],
    ["Phone", item.phone ? formatPhone(item.phone) : "—"],
    ["Message", item.message || "—"],
    ["Newsletter", item.subscribe ? "Opted in" : "No"],
    [
      "Sent from",
      item.form === "contact_us"
        ? "Contact us page"
        : item.location
          ? (ENQUIRY_LOCATION_LABELS[item.location] ?? item.location)
          : "—",
    ],
    [
      "Campaign (UTM)",
      item.utm
        ? Object.entries(item.utm)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n")
        : "—",
    ],
  ];

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 font-hk-grotesk text-xl">
          {item.name}
          {isTest && <TestBadge />}
        </SheetTitle>
        <SheetDescription>
          {ENQUIRY_FORM_LABELS[item.form]} · received {fmtDate(item.createdAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={item.status} onValueChange={(v) => void patch({ status: v as EnquiryStatus })} disabled={saving}>
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENQUIRY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ENQUIRY_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" asChild>
          <a href={viewUrl} target="_blank" rel="noopener noreferrer" title="Open this enquiry's emails in Gmail, then reply in the customer's thread">
            <MailSearch className="mr-2 size-4" /> View in Gmail
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={replyUrl} target="_blank" rel="noopener noreferrer" title="Start a new email to the customer">
            <Mail className="mr-2 size-4" /> New email
          </a>
        </Button>
        {wa && (
          <Button variant="outline" asChild>
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 size-4" /> WhatsApp
            </a>
          </Button>
        )}
        {item.phone && (
          <Button variant="outline" asChild>
            <a href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}>
              <Phone className="mr-2 size-4" /> Call
            </a>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <span>
          {isTest
            ? item.test === true
              ? "Marked as a test by staff."
              : "Looks like a test (the word \"test\" is in the name, email, message or campaign)."
            : item.test === false && auto
              ? "Marked as a real enquiry by staff."
              : "Real enquiry."}
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-crimson-red"
          disabled={saving}
          // Back to automatic when the choice matches the automatic check.
          onClick={() => void patch({ test: !isTest === auto ? null : !isTest })}
        >
          {isTest ? "Not a test" : "Mark as test"}
        </Button>
      </div>

      {item.teamEmail === "failed" && (
        <p className="rounded-md border border-[#F5DB8F] bg-[#FFF8E5] px-3 py-2 text-sm text-[#7A4F00]">
          The notification email to Bella failed. The enquiry itself was saved.
        </p>
      )}

      <dl className="divide-y rounded-md border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[30%_1fr] sm:gap-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3">
        <h3 className="font-hk-grotesk text-base font-semibold">Internal notes</h3>
        {item.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...item.notes].reverse().map((n, i) => (
              <li key={`${n.at}-${i}`} className="rounded-md bg-muted px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap">{n.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.byName} · {fmtDate(n.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note for the team (not visible to the customer)"
          rows={3}
          maxLength={2000}
        />
        <Button
          onClick={async () => {
            if (await patch({ note })) setNote("");
          }}
          disabled={saving || !note.trim()}
        >
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Add note
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Reference: {item.id}</p>
    </div>
  );
}
