"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, Inbox, Loader2, Mail, Paperclip, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  PARTNER_APPLICATION_STATUSES,
  PARTNER_APPLICATION_TYPES,
  PARTNER_STATUS_LABELS,
  PARTNER_TYPE_LABELS,
  type PartnerApplication,
  type PartnerApplicationStatus,
  type PartnerApplicationType,
} from "@/types/partner-applications";

// No `dark:` variants: admin's Tailwind config has no darkMode setting, so
// `dark:` follows the OS theme and would put pale text on these light badges.
const STATUS_STYLES: Record<PartnerApplicationStatus, { badge: string; dot: string }> = {
  new: { badge: "bg-[#FDECEE] text-[#B4232F] border-[#F7C4C9]", dot: "bg-[#EF3340]" },
  reviewing: { badge: "bg-[#FFF4D6] text-[#8A5A00] border-[#F5DB8F]", dot: "bg-[#E0A100]" },
  contacted: { badge: "bg-[#E6F0FF] text-[#1D4ED8] border-[#BFD5FB]", dot: "bg-[#2563EB]" },
  accepted: { badge: "bg-[#E3F8EC] text-[#11703F] border-[#B5E8CB]", dot: "bg-[#16A34A]" },
  declined: { badge: "bg-[#F1F1F1] text-[#505050] border-[#DADADA]", dot: "bg-[#959595]" },
};

const TH = "px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const TD = "px-4 py-3.5 align-middle";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const SINGULAR_LABELS: Record<PartnerApplicationType, string> = {
  host: "Host application",
  affiliate: "Affiliate application",
  supplier: "Supplier enquiry",
};

function StatusBadge({ status }: { status: PartnerApplicationStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-medium", STATUS_STYLES[status].badge)}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_STYLES[status].dot)} aria-hidden="true" />
      {PARTNER_STATUS_LABELS[status]}
    </Badge>
  );
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

function displayName(a: PartnerApplication): string {
  return a.organisation ? `${a.organisation} · ${a.name}` : a.name;
}

export default function PartnershipsList() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [apps, setApps] = useState<PartnerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState<PartnerApplicationType>("host");
  const [status, setStatus] = useState<PartnerApplicationStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await staffFetch("/api/partner-applications");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      setApps(json.data as PartnerApplication[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep link from the notification email (?id=…): jump to that application's tab.
  useEffect(() => {
    if (!selectedId) return;
    const app = apps.find((a) => a.id === selectedId);
    if (app) setType(app.type);
  }, [apps, selectedId]);

  const counts = useMemo(() => {
    const c: Record<PartnerApplicationType, { total: number; fresh: number }> = {
      host: { total: 0, fresh: 0 },
      affiliate: { total: 0, fresh: 0 },
      supplier: { total: 0, fresh: 0 },
    };
    for (const a of apps) {
      c[a.type].total += 1;
      if (a.status === "new") c[a.type].fresh += 1;
    }
    return c;
  }, [apps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (a.type !== type) return false;
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      return [a.name, a.email, a.country, a.organisation ?? "", ...a.answerList.map((x) => x.value)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [apps, type, status, query]);

  const selected = apps.find((a) => a.id === selectedId) ?? null;

  function openDetail(id: string | null) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("id", id);
    else params.delete("id");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function replaceApp(updated: PartnerApplication) {
    setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={type} onValueChange={(v) => setType(v as PartnerApplicationType)}>
          <TabsList className="h-auto flex-wrap">
            {PARTNER_APPLICATION_TYPES.map((t) => (
              <TabsTrigger key={t} value={t} className="gap-2">
                {PARTNER_TYPE_LABELS[t]}
                <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{counts[t].total}</span>
                {counts[t].fresh > 0 && (
                  <span className="rounded-full bg-crimson-red px-2 text-xs text-white">{counts[t].fresh} new</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, answers…"
              className="pl-9 sm:w-72"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as PartnerApplicationStatus | "all")}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PARTNER_APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PARTNER_STATUS_LABELS[s]}
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

      {/* The shared Table has no cell padding or text alignment, so it's set here. */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table className="table-fixed">
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(TH, "w-[38%] lg:w-[30%]")}>
                {type === "supplier" ? "Business" : "Applicant"}
              </TableHead>
              <TableHead className={cn(TH, "hidden lg:table-cell lg:w-[30%]")}>Details</TableHead>
              <TableHead className={cn(TH, "hidden md:table-cell md:w-[16%] lg:w-[13%]")}>Country</TableHead>
              <TableHead className={cn(TH, "hidden sm:table-cell sm:w-[18%] lg:w-[12%]")}>Received</TableHead>
              <TableHead className={cn(TH, "w-[130px]")}>Status</TableHead>
              <TableHead className="w-10" aria-hidden="true" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && apps.length === 0 ? (
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
                    {status !== "all" || query
                      ? `No ${PARTNER_TYPE_LABELS[type].toLowerCase()} match these filters`
                      : `No ${PARTNER_TYPE_LABELS[type].toLowerCase()} yet`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {status !== "all" || query
                      ? "Try clearing the search or status filter."
                      : "New submissions from imheretravels.com/work-with-us appear here."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const isNew = a.status === "new";
                const primary = a.organisation || a.name;
                const secondary = a.organisation ? `${a.name} · ${a.email}` : a.email;
                return (
                  <TableRow
                    key={a.id}
                    className={cn(
                      "group cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none",
                      selectedId === a.id && "bg-muted/60",
                    )}
                    onClick={() => openDetail(a.id)}
                    tabIndex={0}
                    aria-label={`Open ${SINGULAR_LABELS[a.type].toLowerCase()} from ${primary}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(a.id);
                      }
                    }}
                  >
                    <TableCell className={TD}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative shrink-0">
                          <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                            {initials(primary)}
                          </div>
                          {isNew && (
                            <span
                              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-[#EF3340]"
                              aria-label="New"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("truncate text-sm text-foreground", isNew ? "font-semibold" : "font-medium")}>
                              {primary}
                            </span>
                            {a.attachment && (
                              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a document" />
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{secondary}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={cn(TD, "hidden lg:table-cell")}>
                      <div className="flex flex-wrap gap-1">
                        {a.summary.slice(0, 2).map((s) => (
                          <span
                            key={s}
                            className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
                            title={s}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                      {a.destinations && (
                        <p className="mt-1 truncate text-xs text-muted-foreground" title={a.destinations}>
                          {a.destinations}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={cn(TD, "hidden truncate text-sm md:table-cell")}>{a.country || "—"}</TableCell>
                    <TableCell className={cn(TD, "hidden whitespace-nowrap sm:table-cell")}>
                      <span className="text-sm text-foreground" title={fmtDate(a.createdAt)}>
                        {relativeTime(a.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className={TD}>
                      <StatusBadge status={a.status} />
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
            Showing {filtered.length} of {counts[type].total} {PARTNER_TYPE_LABELS[type].toLowerCase()}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && openDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selected && <ApplicationDetail app={selected} onUpdated={replaceApp} toast={toast} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ApplicationDetail({
  app,
  onUpdated,
  toast,
}: {
  app: PartnerApplication;
  onUpdated: (a: PartnerApplication) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState(false);

  async function patch(body: { status?: PartnerApplicationStatus; note?: string }) {
    setSaving(true);
    try {
      const res = await staffFetch(`/api/partner-applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      onUpdated(json.data as PartnerApplication);
      return true;
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openAttachment() {
    setOpening(true);
    try {
      const res = await staffFetch(`/api/partner-applications/${app.id}/attachment`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      window.open(json.url as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "Couldn't open the file", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setOpening(false);
    }
  }

  // Opens a Gmail compose window in a new tab (same account as the header's
  // "Open Gmail" button). A plain mailto: did nothing without a desktop mail app.
  const replyUrl = (() => {
    const firstName = app.name.split(/\s+/)[0] || "";
    const params = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: app.email,
      su: `Your I'm Here Travels ${app.type === "supplier" ? "supplier enquiry" : `${app.type} application`}`,
      body: `Hi ${firstName},\n\n`,
    });
    return `https://mail.google.com/mail/u/0/?${params.toString()}`;
  })();

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="font-hk-grotesk text-xl">{displayName(app)}</SheetTitle>
        <SheetDescription>
          {SINGULAR_LABELS[app.type]} · received {fmtDate(app.createdAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={app.status} onValueChange={(v) => void patch({ status: v as PartnerApplicationStatus })} disabled={saving}>
          <SelectTrigger className="w-44" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARTNER_APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PARTNER_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" asChild>
          <a href={replyUrl} target="_blank" rel="noopener noreferrer">
            <Mail className="mr-2 size-4" /> Reply
          </a>
        </Button>
        {app.attachment && (
          <Button variant="outline" onClick={() => void openAttachment()} disabled={opening}>
            {opening ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            {app.attachment.name.length > 28 ? `${app.attachment.name.slice(0, 25)}…` : app.attachment.name}
          </Button>
        )}
      </div>

      {app.emails && (app.emails.team === "failed" || app.emails.applicant === "failed") && (
        <p className="rounded-md border border-[#F5DB8F] bg-[#FFF8E5] px-3 py-2 text-sm text-[#7A4F00]">
          Email delivery failed ({app.emails.team === "failed" ? "team notification" : ""}
          {app.emails.team === "failed" && app.emails.applicant === "failed" ? " and " : ""}
          {app.emails.applicant === "failed" ? "applicant confirmation" : ""}). The application itself was saved.
        </p>
      )}

      <dl className="divide-y rounded-md border">
        {app.answerList.map((row) => {
          const isLink = /^https?:\/\/\S+$/.test(row.value);
          return (
            <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[40%_1fr] sm:gap-4">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="whitespace-pre-wrap break-words text-sm">
                {isLink ? (
                  <a href={row.value} target="_blank" rel="noopener noreferrer" className="text-crimson-red underline">
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="space-y-3">
        <h3 className="font-hk-grotesk text-base font-semibold">Internal notes</h3>
        {app.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...app.notes].reverse().map((n, i) => (
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
          placeholder="Add a note for the team (not visible to the applicant)"
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

      <p className="text-xs text-muted-foreground">Reference: {app.id}</p>
    </div>
  );
}
