/**
 * Who gets the team notification emails: new tour enquiries and contact
 * messages (sent by the website, www lib/lead-recipients.ts), slot holds and
 * deposits (sent by admin, lib/team-notify-emails.ts).
 *
 * Stored in Firestore `appSettings/teamNotifications`, edited in admin →
 * Settings → Email Settings. bella@ always gets them (the emails go out from
 * her Gmail and she follows up), so a bad setting can never drop a lead.
 * Shared by the server and the settings screen; no Firestore code here.
 */

export const TEAM_SETTINGS_DOC = { collection: "appSettings", id: "teamNotifications" } as const;

/** Always on and can't be removed. */
export const ALWAYS_ON_RECIPIENT = "bella@imheretravels.com";

/** Before anyone saves the setting: the recipients agreed on 2026-11-20. */
export const DEFAULT_RECIPIENTS: TeamRecipient[] = [
  { email: ALWAYS_ON_RECIPIENT, enabled: true, note: "Follows up every lead" },
  { email: "jay@imheretravels.com", enabled: true, note: "WaveX, the ad agency" },
];

export const MAX_RECIPIENTS = 10;

export interface TeamRecipient {
  email: string;
  enabled: boolean;
  /** Who this is, shown in Settings. */
  note?: string;
}

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export const isValidRecipientEmail = (e: string) => e.length <= 254 && EMAIL_RE.test(e);

/**
 * Cleans a stored or submitted list: valid, lower-cased, de-duplicated
 * addresses, at most MAX_RECIPIENTS, with bella@ first and always enabled.
 */
export function sanitizeRecipients(input: unknown): TeamRecipient[] {
  const out: TeamRecipient[] = [{ ...DEFAULT_RECIPIENTS[0] }];
  if (!Array.isArray(input)) return out;
  for (const raw of input) {
    const r = raw as Partial<TeamRecipient> | null;
    const email = typeof r?.email === "string" ? r.email.trim().toLowerCase() : "";
    if (!isValidRecipientEmail(email)) continue;
    const note = typeof r?.note === "string" ? r.note.trim().slice(0, 80) : "";
    if (email === ALWAYS_ON_RECIPIENT) {
      if (note) out[0].note = note;
      continue;
    }
    if (out.some((o) => o.email === email) || out.length >= MAX_RECIPIENTS) continue;
    out.push({ email, enabled: r?.enabled !== false, ...(note ? { note } : {}) });
  }
  return out;
}

/** The addresses to send to: bella@ plus every enabled recipient. */
export function enabledEmails(list: TeamRecipient[]): string[] {
  return sanitizeRecipients(list)
    .filter((r) => r.enabled)
    .map((r) => r.email);
}
