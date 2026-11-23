/**
 * Off-site copy of the prod Firestore export, in a separate AWS account.
 *
 * Why: the export also lands in Firebase Storage inside the same project, so
 * losing or compromising that project would take the backups with it. The S3
 * bucket has Object Lock (compliance mode), so versions cannot be deleted or
 * overwritten until their retention runs out, by anyone.
 *
 * Auth has no stored keys: the function asks the metadata server for a
 * Google-signed ID token for its own service account, and AWS STS exchanges it
 * (AssumeRoleWithWebIdentity) for short-lived credentials on a write-only role.
 * Infra: infra/aws-offsite-backup (Terraform).
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";
import { GoogleAuth } from "google-auth-library";

export type OffsiteConfig = {
  bucket: string;
  region: string;
  roleArn: string;
  audience: string;
};

export type OffsiteSink = {
  bucket: string;
  put: (key: string, body: string) => Promise<void>;
};

type Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
};

export type OffsiteDeps = {
  fetchIdToken: (audience: string) => Promise<string>;
  assumeRole: (
    config: OffsiteConfig,
    webIdentityToken: string,
  ) => Promise<Credentials>;
  send: (
    config: OffsiteConfig,
    credentials: () => Promise<Credentials>,
    key: string,
    body: string,
  ) => Promise<void>;
  now: () => number;
};

const ENV_KEYS = {
  bucket: "OFFSITE_BACKUP_BUCKET",
  region: "OFFSITE_BACKUP_REGION",
  roleArn: "OFFSITE_BACKUP_ROLE_ARN",
  audience: "OFFSITE_BACKUP_AUDIENCE",
} as const;

// Refresh credentials this long before they expire.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * All four variables set -> enabled. None set -> disabled (returns null).
 * Some set -> throws, because a half-configured backup is a silent failure.
 */
export function readOffsiteConfig(
  env: Record<string, string | undefined> = process.env,
): OffsiteConfig | null {
  const entries = Object.entries(ENV_KEYS).map(
    ([field, name]) => [field, env[name]?.trim() || ""] as const,
  );
  const missing = entries.filter(([, value]) => !value);

  if (missing.length === entries.length) return null;
  if (missing.length > 0) {
    const names = missing.map(
      ([field]) => ENV_KEYS[field as keyof typeof ENV_KEYS],
    );
    throw new Error(`Off-site backup half-configured, missing: ${names}`);
  }
  return Object.fromEntries(entries) as OffsiteConfig;
}

// One S3 client per sink (keyed by the sink's credential provider).
const s3Clients = new WeakMap<object, S3Client>();

const defaultDeps: OffsiteDeps = {
  async fetchIdToken(audience) {
    const client = await new GoogleAuth().getIdTokenClient(audience);
    return client.idTokenProvider.fetchIdToken(audience);
  },

  async assumeRole(config, webIdentityToken) {
    const sts = new STSClient({ region: config.region });
    const { Credentials: c } = await sts.send(
      new AssumeRoleWithWebIdentityCommand({
        RoleArn: config.roleArn,
        RoleSessionName: `firestore-export-${Date.now()}`,
        WebIdentityToken: webIdentityToken,
        DurationSeconds: 3600,
      }),
    );
    if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
      throw new Error("STS returned no credentials");
    }
    return {
      accessKeyId: c.AccessKeyId,
      secretAccessKey: c.SecretAccessKey,
      sessionToken: c.SessionToken,
      expiration: c.Expiration ?? new Date(Date.now() + 3600 * 1000),
    };
  },

  async send(config, credentials, key, body) {
    let s3 = s3Clients.get(credentials);
    if (!s3) {
      s3 = new S3Client({ region: config.region, credentials });
      s3Clients.set(credentials, s3);
    }
    // Object Lock buckets require an integrity checksum on every PUT.
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        ChecksumAlgorithm: "SHA256",
      }),
    );
  },

  now: () => Date.now(),
};

/**
 * Returns a sink that writes objects to the off-site bucket. Credentials are
 * fetched lazily, cached, and refreshed shortly before they expire.
 */
export function openOffsiteSink(
  config: OffsiteConfig,
  deps: OffsiteDeps = defaultDeps,
): OffsiteSink {
  let cached: Credentials | null = null;
  let inFlight: Promise<Credentials> | null = null;

  const credentials = async (): Promise<Credentials> => {
    const fresh =
      cached &&
      cached.expiration.getTime() - deps.now() > REFRESH_MARGIN_MS;
    if (fresh && cached) return cached;

    if (!inFlight) {
      inFlight = (async () => {
        const token = await deps.fetchIdToken(config.audience);
        return deps.assumeRole(config, token);
      })().finally(() => {
        inFlight = null;
      });
    }
    cached = await inFlight;
    return cached;
  };

  return {
    bucket: config.bucket,
    put: (key, body) => deps.send(config, credentials, key, body),
  };
}
