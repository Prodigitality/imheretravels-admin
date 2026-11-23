/**
 * Plain-assert unit tests for the off-site backup sink.
 * Run with: npx ts-node src/offsite-backup.test.ts
 */
import assert from "node:assert";
import {
  OffsiteConfig,
  OffsiteDeps,
  openOffsiteSink,
  readOffsiteConfig,
} from "./offsite-backup";

const FULL = {
  OFFSITE_BACKUP_BUCKET: "b",
  OFFSITE_BACKUP_REGION: "ap-southeast-1",
  OFFSITE_BACKUP_ROLE_ARN: "arn:aws:iam::1:role/w",
  OFFSITE_BACKUP_AUDIENCE: "aud",
};

// Config: nothing set -> disabled.
assert.strictEqual(readOffsiteConfig({}), null);
// Config: everything set -> enabled.
assert.deepStrictEqual(readOffsiteConfig(FULL), {
  bucket: "b",
  region: "ap-southeast-1",
  roleArn: "arn:aws:iam::1:role/w",
  audience: "aud",
});
// Config: half set -> loud failure naming what is missing.
assert.throws(
  () => readOffsiteConfig({ ...FULL, OFFSITE_BACKUP_ROLE_ARN: " " }),
  /OFFSITE_BACKUP_ROLE_ARN/,
);

async function credentialCaching() {
  const config = readOffsiteConfig(FULL) as OffsiteConfig;
  let now = 0;
  const calls = { token: 0, assume: 0 };
  const puts: string[] = [];

  const deps: OffsiteDeps = {
    fetchIdToken: async (audience) => {
      assert.strictEqual(audience, "aud");
      calls.token++;
      return "google-id-token";
    },
    assumeRole: async (_c, token) => {
      assert.strictEqual(token, "google-id-token");
      calls.assume++;
      return {
        accessKeyId: "AK",
        secretAccessKey: "SK",
        sessionToken: "ST",
        expiration: new Date(now + 60 * 60 * 1000),
      };
    },
    send: async (_c, credentials, key) => {
      await credentials();
      puts.push(key);
    },
    now: () => now,
  };

  const sink = openOffsiteSink(config, deps);

  // Concurrent first writes share one token exchange.
  await Promise.all([sink.put("a", "{}"), sink.put("b", "{}")]);
  assert.strictEqual(calls.assume, 1);

  // Still valid 50 min later -> reused.
  now = 50 * 60 * 1000;
  await sink.put("c", "{}");
  assert.strictEqual(calls.assume, 1);

  // Within 5 min of expiry -> refreshed.
  now = 56 * 60 * 1000;
  await sink.put("d", "{}");
  assert.strictEqual(calls.assume, 2);
  assert.strictEqual(calls.token, 2);
  assert.deepStrictEqual(puts, ["a", "b", "c", "d"]);
}

async function failedExchangeRetries() {
  const config = readOffsiteConfig(FULL) as OffsiteConfig;
  let attempts = 0;
  const deps: OffsiteDeps = {
    fetchIdToken: async () => "t",
    assumeRole: async () => {
      attempts++;
      if (attempts === 1) throw new Error("AccessDenied");
      return {
        accessKeyId: "AK",
        secretAccessKey: "SK",
        sessionToken: "ST",
        expiration: new Date(Date.now() + 3600 * 1000),
      };
    },
    send: async (_c, credentials) => {
      await credentials();
    },
    now: () => Date.now(),
  };
  const sink = openOffsiteSink(config, deps);
  await assert.rejects(sink.put("a", "{}"), /AccessDenied/);
  // A failure is not cached: the next write tries again.
  await sink.put("b", "{}");
  assert.strictEqual(attempts, 2);
}

(async () => {
  await credentialCaching();
  await failedExchangeRetries();
  console.log("offsite-backup tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
