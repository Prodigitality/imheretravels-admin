"use client";

import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import type { AccountPrompt } from "@/lib/account-prompt";

const DISMISSED_KEY = "iht.accountPrompt.dismissed";

/**
 * Optional "create an account" banner (portal docs/05 P13). Never blocks the
 * page, can be dismissed for good on this device, and links to a blank
 * sign-up form: nothing from the booking is passed along.
 */
export function AccountPromptBanner({ prompt }: { prompt: AccountPrompt | null }) {
  // Starts hidden and checks storage after mount, so the server render and
  // first client render agree and a dismissed banner never flashes.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!prompt || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode or blocked storage: hidden for this visit only.
    }
  }

  return (
    <section
      aria-labelledby="account-prompt-title"
      className="relative mb-4 sm:mb-6 rounded-lg border border-gray-200 border-l-4 border-l-crimson-red bg-white p-3 pr-10 sm:p-4 sm:pr-12 shadow-sm print:hidden"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <UserPlus className="mt-0.5 h-5 w-5 flex-shrink-0 text-crimson-red" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="account-prompt-title" className="text-sm font-semibold text-gray-900">
            Keep this trip and future ones in one place
          </h3>
          <p className="mt-1 text-sm text-gray-700">
            Create a free account to see your bookings and payments any time. Sign up with the email you booked
            with and we&apos;ll find this trip for you. You don&apos;t need an account: this page keeps working
            without one.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={prompt.signUpUrl}
              className="inline-flex items-center rounded-full bg-crimson-red px-4 py-1.5 text-sm font-medium text-white hover:bg-crimson-red/90"
            >
              Create an account
            </a>
            <a href={prompt.signInUrl} className="text-sm font-medium text-gray-900 underline">
              I already have one
            </a>
            <button type="button" onClick={dismiss} className="text-sm text-gray-600 underline hover:text-gray-900">
              No thanks
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
