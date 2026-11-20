"use client";

import { suggestEmail } from "@/lib/email-typo";

/**
 * "Did you mean sam@gmail.com?" under an email field of the booking form when
 * the domain looks like a typo of a common provider. One tap fixes it; it
 * never blocks the form (the server refuses domains that can't take mail).
 */
export default function EmailSuggestion({
  email,
  onUse,
  disabled,
}: {
  email: string;
  onUse: (fixed: string) => void;
  disabled?: boolean;
}) {
  const fix = !disabled && email.includes("@") ? suggestEmail(email) : null;
  if (!fix) return null;
  return (
    <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
      Did you mean{" "}
      <button
        type="button"
        onClick={() => onUse(fix)}
        className="font-semibold text-crimson-red underline underline-offset-2 hover:text-light-red"
      >
        {fix}
      </button>
      ?
    </p>
  );
}
