"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronRight, Inbox, Loader2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { staffFetch } from "@/lib/staff-fetch";
import { cn } from "@/lib/utils";
import {
  CLAIM_STATE_LABELS,
  CONFLICT_HELP,
  CONFLICT_LABELS,
  DECISION_LABELS,
  EVIDENCE_CHECKLIST,
  REASON_CODES,
  REASON_LABELS,
  type AccountClaim,
  type ClaimBooking,
  type ClaimState,
  type DecisionAction,
} from "@/types/account-claims";

// No `dark:` variants: admin's Tailwind has no darkMode setting (see PartnershipsList).
const STATE_STYLES: Record<ClaimState, { badge: string; dot: string }> = {
  open: { badge: "bg-[#FDECEE] text-[#B4232F] border-[#F7C4C9]", dot: "bg-[#EF3340]" },
  needs_evidence: { badge: "bg-[#FFF4D6] text-[#8A5A00] border-[#F5DB8F]", dot: "bg-[#E0A100]" },
  approved: { badge: "bg-[#E3F8EC] text-[#11703F] border-[#B5E8CB]", dot: "bg-[#16A34A]" },
  rejected: { badge: "bg-[#F1F1F1] text-[#505050] border-[#DADADA]", dot: "bg-[#959595]" },
};

const TH = "px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const TD = "px-4 py-3.5 align-middle";

type View = "active" | "resolved" | "all";
const isActive = (c: AccountClaim) => c.state === "open" || c.state === "needs_evidence";

function fmtDate(iso: string | null, withTime = true): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function fmtDay(day: string | null): string {
  if (!day) return "—";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function StateBadge({ state }: { state: ClaimState }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-medium", STATE_STYLES[state].badge)}>
      <span className={cn("size-1.5 rounded-full", STATE_STYLES[state].dot)} aria-hidden="true" />
      {CLAIM_STATE_LABELS[state]}
    </Badge>
  );
}

function DueText({ claim }: { claim: AccountClaim }) {
  if (!isActive(claim) || !claim.dueAt) return null;
  return claim.overdue ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B4232F]">
      <AlertTriangle className="size-3.5" aria-hidden="true" />
      Overdue since {fmtDate(claim.dueAt)}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">Reply by {fmtDate(claim.dueAt)}</span>
  );
}

export default function AccountClaimsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [claims, setClaims] = useState<AccountClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("active");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await staffFetch("/api/account-claims");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      setClaims(json.data as AccountClaim[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      active: claims.filter(isActive).length,
      overdue: claims.filter((c) => c.overdue).length,
      resolved: claims.filter((c) => !isActive(c)).length,
      all: claims.length,
    }),
    [claims],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = claims.filter((c) => (view === "active" ? isActive(c) : view === "resolved" ? !isActive(c) : true));
    // Active cases: oldest first, so the next one due is on top.
    if (view === "active") list.sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
    if (!q) return list;
    return list.filter((c) =>
      [c.customer.name, c.customer.email, c.booking?.ref ?? "", c.booking?.tourName ?? "", c.booking?.travellerName ?? "", c.customerMessage]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [claims, view, query]);

  const selected = claims.find((c) => c.id === selectedId) ?? null;

  function openDetail(id: string | null) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("id", id);
    else params.delete("id");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="active" className="gap-2">
              To do
              <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{counts.active}</span>
              {counts.overdue > 0 && (
                <span className="rounded-full bg-crimson-red px-2 text-xs text-white">{counts.overdue} overdue</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="resolved" className="gap-2">
              Resolved
              <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{counts.resolved}</span>
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              All
              <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{counts.all}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, booking ref, tour…"
              className="pl-9 sm:w-72"
            />
          </div>
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
              <TableHead className={cn(TH, "w-[45%] lg:w-[28%]")}>Customer</TableHead>
              <TableHead className={cn(TH, "hidden lg:table-cell lg:w-[30%]")}>Booking</TableHead>
              <TableHead className={cn(TH, "hidden md:table-cell md:w-[22%] lg:w-[18%]")}>Received</TableHead>
              <TableHead className={cn(TH, "w-[170px]")}>Status</TableHead>
              <TableHead className="w-10" aria-hidden="true" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && claims.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="px-4 py-16 text-center">
                  <Inbox className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {query ? "No cases match this search" : view === "active" ? "Nothing to review" : "No cases yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {query
                      ? "Try a different name, email or booking reference."
                      : "Cases appear here when a customer's booking can't be added to their account automatically."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className={cn("group cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none", selectedId === c.id && "bg-muted/60")}
                  onClick={() => openDetail(c.id)}
                  tabIndex={0}
                  aria-label={`Open case from ${c.customer.name || c.customer.email}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDetail(c.id);
                    }
                  }}
                >
                  <TableCell className={TD}>
                    <p className="truncate text-sm font-semibold text-foreground">{c.customer.name || c.customer.email || "Unknown customer"}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.customer.email}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground lg:hidden">{CONFLICT_LABELS[c.conflictType]}</p>
                  </TableCell>
                  <TableCell className={cn(TD, "hidden lg:table-cell")}>
                    <p className="truncate text-sm text-foreground">
                      {c.booking ? `${c.booking.ref || "No ref"} · ${c.booking.tourName}` : "Not found yet"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{CONFLICT_LABELS[c.conflictType]}</p>
                  </TableCell>
                  <TableCell className={cn(TD, "hidden md:table-cell")}>
                    <p className="text-sm text-foreground">{fmtDate(c.submittedAt, false)}</p>
                    <DueText claim={c} />
                  </TableCell>
                  <TableCell className={TD}>
                    <StateBadge state={c.state} />
                    <div className="mt-1 md:hidden">
                      <DueText claim={c} />
                    </div>
                  </TableCell>
                  <TableCell className="pr-3 text-muted-foreground">
                    <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && openDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {/* Keyed on state too, so the decision form starts fresh after a decision. */}
          {selected && <ClaimDetail key={`${selected.id}:${selected.state}`} claim={selected} onDecided={load} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function BookingDetails({ booking, claimantEmail }: { booking: ClaimBooking; claimantEmail: string }) {
  return (
    <dl className="divide-y rounded-md border">
      <Row label="Reference">{booking.ref || "—"}</Row>
      <Row label="Tour">
        {booking.tourName || "—"} · {fmtDay(booking.tourDate)}
      </Row>
      <Row label="Traveller">
        {booking.travellerName || "—"}
        {booking.isMainBooker ? " (Main Booker)" : ""}
        {booking.bookingType ? ` · ${booking.bookingType}` : ""}
      </Row>
      <Row label="Booking email">
        {booking.email || "—"}
        {booking.email && booking.email.toLowerCase() === claimantEmail.toLowerCase() && (
          <span className="ml-2 text-xs text-muted-foreground">(same as the customer&apos;s)</span>
        )}
      </Row>
      <Row label="Linked to">
        {!booking.holder ? (
          "No account"
        ) : booking.holder.isClaimant ? (
          "This customer"
        ) : (
          <span className="font-medium text-[#B4232F]">
            Another account: {booking.holder.name ? `${booking.holder.name} · ` : ""}
            {booking.holder.email}
            {booking.holder.linkedAt ? ` (since ${fmtDate(booking.holder.linkedAt, false)})` : ""}
          </span>
        )}
      </Row>
    </dl>
  );
}

function BookingPicker({
  claimId,
  claimantEmail,
  chosen,
  onChoose,
}: {
  claimId: string;
  claimantEmail: string;
  chosen: ClaimBooking | null;
  onChoose: (b: ClaimBooking | null) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ClaimBooking[] | null>(null);
  const [error, setError] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const res = await staffFetch(`/api/account-claims/${claimId}/bookings?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Search failed");
      setResults(json.data as ClaimBooking[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  if (chosen) {
    return (
      <div className="space-y-2">
        <BookingDetails booking={chosen} claimantEmail={claimantEmail} />
        <Button variant="outline" size="sm" onClick={() => onChoose(null)}>
          Choose a different booking
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Booking reference or email it was made with"
          aria-label="Find the booking"
        />
        <Button type="submit" variant="outline" disabled={busy || q.trim().length < 3}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Find"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {results && results.length === 0 && <p className="text-sm text-muted-foreground">No booking with that exact reference or email.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y rounded-md border">
          {results.map((b) => (
            <li key={b.documentId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {b.travellerName || "—"} · {b.ref || "No ref"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {b.tourName} · {fmtDay(b.tourDate)} · {b.email || "no email"}
                  {b.holder ? (b.holder.isClaimant ? " · already this customer's" : " · on another account") : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onChoose(b)}>
                Select
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimDetail({ claim, onDecided }: { claim: AccountClaim; onDecided: () => Promise<void> }) {
  const { toast } = useToast();
  const active = isActive(claim);
  const [chosen, setChosen] = useState<ClaimBooking | null>(null);
  const booking = claim.booking ?? chosen;
  const actions: DecisionAction[] = claim.state === "needs_evidence" ? ["approve", "reject"] : ["approve", "needs_evidence", "reject"];
  const [action, setAction] = useState<DecisionAction | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [revoke, setRevoke] = useState(false);
  const [emailCustomer, setEmailCustomer] = useState(true);
  const [saving, setSaving] = useState(false);

  const heldElsewhere = !!booking?.holder && !booking.holder.isClaimant;
  const alreadyTheirs = !!booking?.holder?.isClaimant;
  const blocked =
    !action ||
    !reason ||
    (action === "approve" && !booking) ||
    (action === "approve" && heldElsewhere && !revoke);

  async function submit() {
    if (blocked) return;
    setSaving(true);
    try {
      const res = await staffFetch(`/api/account-claims/${claim.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reasonCode: reason,
          note,
          bookingDocumentId: claim.booking ? undefined : chosen?.documentId,
          revokeExisting: action === "approve" && heldElsewhere ? revoke : false,
          emailCustomer,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      const failed = (json.emails as { kind: string; sent: boolean }[]).filter((e) => !e.sent);
      await onDecided(); // refresh first, so the list and the toast agree
      toast({
        title: `Saved: ${CLAIM_STATE_LABELS[json.state as ClaimState]}`,
        description: failed.length
          ? `The decision is saved, but ${failed.length} email${failed.length === 1 ? "" : "s"} didn't send. Email the customer yourself.`
          : json.emails.length
            ? `${json.emails.length} email${json.emails.length === 1 ? "" : "s"} sent.`
            : "No emails sent.",
        variant: failed.length ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: "Couldn't save the decision", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={claim.state} />
          <Badge variant="outline" className="rounded-full font-medium">
            {CONFLICT_LABELS[claim.conflictType]}
          </Badge>
        </div>
        <SheetTitle className="text-left">{claim.customer.name || claim.customer.email || "Unknown customer"}</SheetTitle>
        <SheetDescription className="text-left">
          Received {fmtDate(claim.submittedAt)} · <DueText claim={claim} />
        </SheetDescription>
      </SheetHeader>

      <p className="rounded-md bg-muted/60 px-4 py-3 text-sm text-foreground">{CONFLICT_HELP[claim.conflictType]}</p>

      {claim.emailFailures.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-[#F7C4C9] bg-[#FDECEE] px-4 py-3 text-sm text-[#B4232F]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            An email about this case didn&apos;t send ({fmtDate(claim.emailFailures[claim.emailFailures.length - 1].at)}). Please
            email the customer yourself from bella@.
          </p>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Customer account</h3>
        <dl className="divide-y rounded-md border">
          <Row label="Email">{claim.customer.email || "—"}</Row>
          <Row label="Name">{claim.customer.name || "—"}</Row>
          <Row label="Account created">{fmtDate(claim.customer.accountCreatedAt, false)}</Row>
          <Row label="Email verified">{fmtDate(claim.customer.emailVerifiedAt, false)}</Row>
        </dl>
      </section>

      {claim.customerMessage && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">What the customer told us</h3>
          <p className="whitespace-pre-wrap rounded-md border bg-card px-4 py-3 text-sm">{claim.customerMessage}</p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Booking</h3>
        {claim.booking ? (
          <BookingDetails booking={claim.booking} claimantEmail={claim.customer.email} />
        ) : active ? (
          <BookingPicker claimId={claim.id} claimantEmail={claim.customer.email} chosen={chosen} onChoose={setChosen} />
        ) : (
          <p className="text-sm text-muted-foreground">No booking was linked.</p>
        )}
      </section>

      {active && (
        <section className="space-y-4 rounded-md border p-4">
          <div>
            <h3 className="text-sm font-semibold">Decision</h3>
            <p className="mt-1 text-xs text-muted-foreground">Before approving, check: {EVIDENCE_CHECKLIST.join(" · ")}.</p>
          </div>

          <RadioGroup
            value={action}
            onValueChange={(v) => {
              setAction(v as DecisionAction);
              setReason("");
            }}
            className="gap-2"
          >
            {actions.map((a) => (
              <div key={a} className="flex items-center gap-2">
                <RadioGroupItem value={a} id={`action-${a}`} />
                <Label htmlFor={`action-${a}`} className="font-normal">
                  {DECISION_LABELS[a]}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {action === "approve" && !booking && (
            <p className="text-sm text-[#8A5A00]">Find and select the customer&apos;s booking above first.</p>
          )}
          {action === "approve" && alreadyTheirs && (
            <p className="text-sm text-muted-foreground">This booking is already on the customer&apos;s account; approving just closes the case.</p>
          )}
          {action === "approve" && heldElsewhere && (
            <div className="flex items-start gap-2 rounded-md border border-[#F7C4C9] bg-[#FDECEE] p-3">
              <Checkbox id="revoke" checked={revoke} onCheckedChange={(v) => setRevoke(v === true)} className="mt-0.5" />
              <Label htmlFor="revoke" className="text-sm font-normal leading-snug text-[#B4232F]">
                Remove this booking from {booking!.holder!.email}&apos;s account and add it to this customer&apos;s. We&apos;ll
                email the other account to say it was removed.
              </Label>
            </div>
          )}

          {action && (
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_CODES[action].map((r) => (
                    <SelectItem key={r} value={r}>
                      {REASON_LABELS[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note">Internal note (optional)</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
            <p className="text-xs text-muted-foreground">Staff only. Never sent to the customer.</p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="email" checked={emailCustomer} onCheckedChange={(v) => setEmailCustomer(v === true)} className="mt-0.5" />
            <Label htmlFor="email" className="text-sm font-normal leading-snug">
              Email the customer about this decision
              {action === "needs_evidence" && " (asks for the booking ref, birthdate and payment email)"}
            </Label>
          </div>

          <Button onClick={() => void submit()} disabled={blocked || saving} className="w-full sm:w-auto">
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save decision
          </Button>
        </section>
      )}

      {claim.history.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">History</h3>
          <ul className="space-y-2">
            {[...claim.history].reverse().map((h, i) => (
              <li key={i} className="rounded-md border px-4 py-3 text-sm">
                <p className="font-medium">
                  {DECISION_LABELS[h.action]} · {REASON_LABELS[h.reasonCode] ?? h.reasonCode}
                </p>
                <p className="text-xs text-muted-foreground">
                  {h.byName} · {fmtDate(h.at)}
                  {h.emailed ? " · customer email requested" : ""}
                </p>
                {h.note && <p className="mt-1 whitespace-pre-wrap text-sm">{h.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
