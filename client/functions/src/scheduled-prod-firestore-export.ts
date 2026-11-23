import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { openOffsiteSink, readOffsiteConfig } from "./offsite-backup";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const storage = getStorage();

const PROD_PROJECT_ID = "imheretravels-a3f81";
const STORAGE_ROOT = "firestore-exports/prod";
const REGION = "asia-southeast1";
const TIME_ZONE = "Asia/Manila";
const EXPORT_SCHEDULE = "0 2 * * 1,4";

const COLLECTIONS = [
  "bcc-users",
  "bookingSheetColumns",
  "bookingVersions",
  "bookings",
  "emailTemplates",
  "emails",
  "file_objects",
  "paymentTerms",
  "scheduledEmails",
  "stripePayments",
  "tourPackages",
  "ts_files",
  "ts_folders",
  "users",
] as const;

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

type ExportStatus = "success" | "empty" | "error";

type ExportResult = {
  collection: string;
  count: number;
  status: ExportStatus;
  filename?: string;
  storagePath?: string;
  error?: string;
};

// Writes the same bytes off-site (S3). Never throws; failures are counted.
type CopyOffsite = (storagePath: string, body: string) => Promise<void>;

type OffsiteStatus = {
  enabled: boolean;
  bucket?: string;
  failed: number;
  setupError?: string;
};

type ExportSummary = {
  timestamp: string;
  exportedAt: string;
  projectId: string;
  bucketName: string;
  storageRoot: string;
  runStoragePath: string;
  schedule: {
    cron: string;
    timeZone: string;
    region: string;
  };
  totalCollections: number;
  successful: number;
  empty: number;
  errors: number;
  totalDocuments: number;
  results: ExportResult[];
  offsite: OffsiteStatus;
};

function getProjectId(): string {
  return (
    getApp().options.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    "unknown"
  );
}

function createExportTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-").replace(/\./g, "-");
}

function getManilaDatePath(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const year = partMap.get("year");
  const month = partMap.get("month");
  const day = partMap.get("day");

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10).replace(/-/g, "/");
  }

  return `${year}/${month}/${day}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function saveJson(
  bucket: Bucket,
  storagePath: string,
  value: unknown,
  copyOffsite: CopyOffsite,
): Promise<void> {
  const body = JSON.stringify(value, null, 2);
  await bucket.file(storagePath).save(body, {
    resumable: false,
    metadata: {
      contentType: "application/json",
      cacheControl: "no-store",
    },
  });
  await copyOffsite(storagePath, body);
}

async function exportCollection(
  bucket: Bucket,
  runStoragePath: string,
  timestamp: string,
  collectionName: string,
  copyOffsite: CopyOffsite,
): Promise<ExportResult> {
  logger.info("Exporting Firestore collection", { collectionName });

  try {
    const snapshot = await db.collection(collectionName).get();

    if (snapshot.empty) {
      logger.info("Collection is empty", { collectionName });
      return {
        collection: collectionName,
        count: 0,
        status: "empty",
      };
    }

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));

    const filename = `${collectionName}-${timestamp}.json`;
    const storagePath = `${runStoragePath}/collections/${filename}`;
    await saveJson(bucket, storagePath, data, copyOffsite);

    logger.info("Collection export uploaded", {
      collectionName,
      count: data.length,
      storagePath,
    });

    return {
      collection: collectionName,
      count: data.length,
      status: "success",
      filename,
      storagePath,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Collection export failed", {
      collectionName,
      error: errorMessage,
    });

    return {
      collection: collectionName,
      count: 0,
      status: "error",
      error: errorMessage,
    };
  }
}

function createSummary(
  timestamp: string,
  exportedAt: string,
  projectId: string,
  bucketName: string,
  runStoragePath: string,
  results: ExportResult[],
  offsite: OffsiteStatus,
): ExportSummary {
  return {
    timestamp,
    exportedAt,
    projectId,
    bucketName,
    storageRoot: STORAGE_ROOT,
    runStoragePath,
    schedule: {
      cron: EXPORT_SCHEDULE,
      timeZone: TIME_ZONE,
      region: REGION,
    },
    totalCollections: COLLECTIONS.length,
    successful: results.filter((result) => result.status === "success")
      .length,
    empty: results.filter((result) => result.status === "empty").length,
    errors: results.filter((result) => result.status === "error").length,
    totalDocuments: results.reduce((sum, result) => sum + result.count, 0),
    results,
    offsite,
  };
}

export const exportProdFirestoreCollections = onSchedule(
  {
    schedule: EXPORT_SCHEDULE,
    region: REGION,
    timeZone: TIME_ZONE,
    timeoutSeconds: 540,
    memory: "1GiB",
    maxInstances: 1,
  },
  async () => {
    const projectId = getProjectId();

    if (projectId !== PROD_PROJECT_ID) {
      logger.warn("Skipping prod Firestore export outside prod project", {
        expectedProjectId: PROD_PROJECT_ID,
        actualProjectId: projectId,
      });
      return;
    }

    const exportDate = new Date();
    const timestamp = createExportTimestamp(exportDate);
    const datePath = getManilaDatePath(exportDate);
    const runStoragePath = `${STORAGE_ROOT}/${datePath}/${timestamp}`;
    const bucket = storage.bucket();

    // Off-site copy (S3, separate account). Disabled when not configured; a
    // half-configured setup is recorded as an error rather than skipped.
    const offsite: OffsiteStatus = { enabled: false, failed: 0 };
    let sink: ReturnType<typeof openOffsiteSink> | null = null;
    try {
      const offsiteConfig = readOffsiteConfig();
      if (offsiteConfig) {
        sink = openOffsiteSink(offsiteConfig);
        offsite.enabled = true;
        offsite.bucket = sink.bucket;
      }
    } catch (error) {
      offsite.setupError = getErrorMessage(error);
      logger.error("Off-site backup misconfigured", {
        error: offsite.setupError,
      });
    }

    const copyOffsite: CopyOffsite = async (storagePath, body) => {
      if (!sink) return;
      try {
        await sink.put(storagePath, body);
      } catch (error) {
        offsite.failed += 1;
        logger.error("Off-site copy failed", {
          storagePath,
          error: getErrorMessage(error),
        });
      }
    };

    logger.info("Starting prod Firestore export", {
      projectId,
      bucketName: bucket.name,
      runStoragePath,
      collectionCount: COLLECTIONS.length,
      offsiteBucket: offsite.bucket ?? null,
    });

    const results: ExportResult[] = [];

    for (const collectionName of COLLECTIONS) {
      const result = await exportCollection(
        bucket,
        runStoragePath,
        timestamp,
        collectionName,
        copyOffsite,
      );
      results.push(result);
    }

    const summary = createSummary(
      timestamp,
      exportDate.toISOString(),
      projectId,
      bucket.name,
      runStoragePath,
      results,
      offsite,
    );
    const summaryFilename = `_export-summary-${timestamp}.json`;
    const summaryStoragePath = `${runStoragePath}/${summaryFilename}`;

    await saveJson(bucket, summaryStoragePath, summary, copyOffsite);
    // Written last: the AWS monitor treats this file as "the run finished".
    await saveJson(
      bucket,
      `${STORAGE_ROOT}/latest/_export-summary.json`,
      { ...summary, summaryStoragePath },
      copyOffsite,
    );

    logger.info("Prod Firestore export completed", {
      totalDocuments: summary.totalDocuments,
      successful: summary.successful,
      empty: summary.empty,
      errors: summary.errors,
      summaryStoragePath,
      offsite,
    });

    if (summary.errors > 0) {
      throw new Error(
        `Prod Firestore export finished with ${summary.errors} error(s)`,
      );
    }
    if (offsite.setupError || offsite.failed > 0) {
      throw new Error(
        `Off-site backup incomplete: ${offsite.failed} failed copy(ies)` +
          (offsite.setupError ? `, setup: ${offsite.setupError}` : ""),
      );
    }
  },
);
