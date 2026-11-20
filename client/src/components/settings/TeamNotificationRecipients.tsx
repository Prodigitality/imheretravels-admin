"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { staffFetch } from "@/lib/staff-fetch";
import {
  ALWAYS_ON_RECIPIENT,
  MAX_RECIPIENTS,
  isValidRecipientEmail,
  type TeamRecipient,
} from "@/lib/team-recipients";

const API = "/api/settings/team-notifications";

/**
 * Settings → Email Settings: who gets the team emails for new enquiries,
 * contact messages, slot holds and deposits. Each change saves straight away.
 */
export default function TeamNotificationRecipients({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<TeamRecipient[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await staffFetch(API);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load");
      setRecipients(data.recipients);
    } catch (e) {
      toast({ title: "Couldn't load the recipients", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: TeamRecipient[], done: string) {
    const before = recipients;
    setRecipients(next);
    setSaving(true);
    try {
      const res = await staffFetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save");
      setRecipients(data.recipients);
      toast({ title: done });
      return true;
    } catch (e) {
      setRecipients(before);
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const email = newEmail.trim().toLowerCase();
  const duplicate = !!recipients?.some((r) => r.email === email);
  const canAdd = canEdit && !saving && isValidRecipientEmail(email) && !duplicate && (recipients?.length ?? 0) < MAX_RECIPIENTS;

  async function add() {
    if (!recipients || !canAdd) return;
    const ok = await save([...recipients, { email, enabled: true, ...(newNote.trim() ? { note: newNote.trim() } : {}) }], `${email} added`);
    if (ok) {
      setNewEmail("");
      setNewNote("");
    }
  }

  return (
    <Card className="border border-royal-purple/20 dark:border-border shadow">
      <CardHeader className="bg-muted/50 border-b border-royal-purple/20 dark:border-border">
        <CardTitle className="text-foreground">Team notification emails</CardTitle>
        <CardDescription className="text-muted-foreground">
          Who gets an email for each new tour enquiry, contact message, Black Friday slot hold and paid deposit. Switch
          someone off to pause their emails. {ALWAYS_ON_RECIPIENT} always gets them: the emails are sent from that inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {!recipients ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {recipients.map((r) => {
              const locked = r.email === ALWAYS_ON_RECIPIENT;
              const id = `recipient-${r.email}`;
              return (
                <li key={r.email} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <Switch
                    id={id}
                    checked={r.enabled}
                    disabled={locked || !canEdit || saving}
                    onCheckedChange={(on) =>
                      void save(
                        recipients.map((x) => (x.email === r.email ? { ...x, enabled: on } : x)),
                        on ? `${r.email} will get the emails` : `${r.email} paused`,
                      )
                    }
                    aria-label={`Send team emails to ${r.email}`}
                  />
                  <Label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={r.enabled ? "font-medium text-foreground" : "font-medium text-muted-foreground"}>
                      {r.email}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {locked ? "Always on" : r.enabled ? "Gets the emails" : "Paused"}
                      {r.note ? ` · ${r.note}` : ""}
                    </span>
                  </Label>
                  {locked ? (
                    <Lock className="size-4 text-muted-foreground" aria-label="Always on" />
                  ) : (
                    canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={saving}
                        onClick={() => void save(recipients.filter((x) => x.email !== r.email), `${r.email} removed`)}
                        aria-label={`Remove ${r.email}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit ? (
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_2fr_auto] md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-recipient-email">Add an email address</Label>
              <Input
                id="new-recipient-email"
                type="email"
                placeholder="name@imheretravels.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-recipient-note">Who is it? (optional)</Label>
              <Input id="new-recipient-note" placeholder="e.g. Sales team" maxLength={80} value={newNote} onChange={(e) => setNewNote(e.target.value)} />
            </div>
            <Button type="submit" disabled={!canAdd}>
              <Plus className="mr-2 size-4" /> Add
            </Button>
            {duplicate && <p className="text-xs text-destructive md:col-span-3">That address is already on the list.</p>}
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">Ask an admin to change who gets these emails.</p>
        )}
      </CardContent>
    </Card>
  );
}
