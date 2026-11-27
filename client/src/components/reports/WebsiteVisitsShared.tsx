"use client";

import { useCallback } from "react";
import type { WebsiteVisitsReport as Report } from "@/types/website-visits";
import WebsiteVisitsReport from "./WebsiteVisitsReport";

/** The report as seen through the agency's private link (no login). */
export default function WebsiteVisitsShared({ token }: { token: string }) {
  const load = useCallback(
    async (start: string, end: string): Promise<Report> => {
      const res = await fetch(
        `/api/public/website-visits/${encodeURIComponent(token)}?start=${start}&end=${end}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn't load the report");
      return data.report as Report;
    },
    [token],
  );
  return <WebsiteVisitsReport load={load} />;
}
