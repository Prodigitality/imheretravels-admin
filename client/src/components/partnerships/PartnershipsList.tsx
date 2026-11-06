"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2, Mail, Paperclip, RefreshCw, Search } from "lucide-react";
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

const STATUS_STYLES: Record<PartnerApplicationStatus, string> = {
  new: "bg-crimson-red/10 text-crimson-red border-crimson-red/30",
  reviewing: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200",
  contacted: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200",
  accepted: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200",
  declined: "bg-muted text-muted-foreground border-border",
};

const SINGULAR_LABELS: Record<PartnerApplicationType, string> = {
  host: "Host application",
  affiliate: "Affiliate application",
  supplier: "Supplier enquiry",
};

function StatusBadge({ status }: { status: PartnerApplicationStatus }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", STATUS_STYLES[status])}>
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
    const c = { host: 0, affiliate: 0, supplier: 0 } as Record<PartnerApplicationType, { total: number; fresh: number }>;
    for (const t of PARTNER_APPLICATION_TYPES) c[t] = { total: 0, fresh: 0 };
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

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{type === "supplier" ? "Business / contact" : "Name"}</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden lg:table-cell">Country</TableHead>
              <TableHead className="hidden sm:table-cell">Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && apps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No {PARTNER_TYPE_LABELS[type].toLowerCase()} {status !== "all" || query ? "match these filters" : "yet"}.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => (
                <TableRow
                  key={a.id}
                  className={cn("cursor-pointer", a.status === "new" && "font-medium")}
                  onClick={() => openDetail(a.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDetail(a.id);
                    }
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {displayName(a)}
                      {a.attachment && <Paperclip className="size-3.5 text-muted-foreground" aria-label="Has attachment" />}
                    </div>
                    <div className="text-xs text-muted-foreground md:hidden">{a.email}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{a.email}</TableCell>
                  <TableCell className="hidden lg:table-cell">{a.country}</TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">{fmtDate(a.createdAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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

  const replySubject = encodeURIComponent(`Your I'm Here Travels ${app.type === "supplier" ? "supplier enquiry" : `${app.type} application`}`);

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
          <a href={`mailto:${app.email}?subject=${replySubject}`}>
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
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
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
