"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { staffFetch } from "@/lib/staff-fetch";
import type { WebsiteVisitsReport as Report } from "@/types/website-visits";
import WebsiteVisitsReport from "./WebsiteVisitsReport";

async function loadReport(start: string, end: string): Promise<Report> {
  const res = await staffFetch(`/api/reports/website-visits?start=${start}&end=${end}`);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || "Couldn't load the report");
  return data.report as Report;
}

type Share = { enabled: boolean; token: string | null };

/** Private no-login link for the ad agency: counts only, no customer data. */
function ShareCard() {
  const { toast } = useToast();
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (method: "GET" | "POST" | "DELETE") => {
    setBusy(true);
    try {
      const res = await staffFetch("/api/reports/website-visits/share", { method });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn't update the link");
      setShare(data.share as Share);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Couldn't update the link",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void call("GET");
  }, [call]);

  const url = share?.token ? `${window.location.origin}/share/website-visits/${share.token}` : "";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Share with the ad agency
        </CardTitle>
        <CardDescription>
          A private link that opens this report without logging in. It shows visit numbers only, no customer data.
          Replacing it stops the old link working.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {share?.enabled && url ? (
          <>
            <Input readOnly value={url} className="h-9 min-w-[280px] flex-1 font-mono text-xs" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                toast({ title: "Link copied" });
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void call("POST")}>
              Replace link
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void call("DELETE")}>
              Turn off
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy || !share} onClick={() => void call("POST")}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function WebsiteVisitsStaff() {
  return <WebsiteVisitsReport load={loadReport} aside={<ShareCard />} />;
}
