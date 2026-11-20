import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPIENTS, enabledEmails, sanitizeRecipients } from "./team-recipients";

describe("team recipients", () => {
  it("defaults to bella@ and jay@", () => {
    expect(enabledEmails(DEFAULT_RECIPIENTS)).toEqual(["bella@imheretravels.com", "jay@imheretravels.com"]);
  });

  it("a paused recipient gets nothing; bella@ can't be paused or removed", () => {
    const list = sanitizeRecipients([
      { email: "bella@imheretravels.com", enabled: false },
      { email: "jay@imheretravels.com", enabled: false },
    ]);
    expect(enabledEmails(list)).toEqual(["bella@imheretravels.com"]);
    expect(enabledEmails(sanitizeRecipients([]))).toEqual(["bella@imheretravels.com"]);
    expect(enabledEmails(sanitizeRecipients("nonsense"))).toEqual(["bella@imheretravels.com"]);
  });

  it("drops invalid, duplicate and header-injection addresses, lower-cases the rest", () => {
    const list = sanitizeRecipients([
      { email: " Jay@ImHereTravels.com ", enabled: true, note: "WaveX" },
      { email: "jay@imheretravels.com", enabled: true },
      { email: "a@b.co, evil@x.com", enabled: true },
      { email: "not an email", enabled: true },
      { email: "x@y.co\r\nBcc: z@z.co", enabled: true },
    ]);
    expect(list.map((r) => r.email)).toEqual(["bella@imheretravels.com", "jay@imheretravels.com"]);
    expect(list[1]).toEqual({ email: "jay@imheretravels.com", enabled: true, note: "WaveX" });
  });

  it("keeps at most 10", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ email: `p${i}@x.co`, enabled: true }));
    expect(sanitizeRecipients(many)).toHaveLength(10);
  });
});
