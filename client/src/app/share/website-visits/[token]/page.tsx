import { Metadata } from "next";
import { isValidShareToken } from "@/lib/website-visits-share";
import WebsiteVisitsShared from "@/components/reports/WebsiteVisitsShared";

/**
 * The agency's private, no-login view of Reports → Website visits. No
 * DashboardLayout, so no login is needed; the token in the URL must match the
 * current link (lib/website-visits-share.ts). Shows visit counts only.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Website visits - I'm Here Travels",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharedWebsiteVisitsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isValidShareToken(token).catch(() => false);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="mb-6 text-sm font-semibold text-muted-foreground">I&apos;m Here Travels</p>
        {valid ? (
          <WebsiteVisitsShared token={token} />
        ) : (
          <div className="rounded-md border border-border p-6 text-center">
            <h1 className="text-lg font-semibold">This link is no longer active</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ask the I&apos;m Here Travels team for a new one.</p>
          </div>
        )}
      </div>
    </main>
  );
}
