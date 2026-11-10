import type { SheetData } from "@/types/sheet-management";
import type {
  BranchInfo,
  BulkOperationMetadata,
  BulkOperationOptions,
  CreateVersionOptions,
  FieldChange,
} from "@/types/version-history";

/**
 * Builds `bookingVersions` documents without touching Firestore, so the
 * browser service (`booking-version-history-service`, browser SDK) and the
 * API routes (`booking-version-history-server`, firebase-admin) write
 * identical documents.
 *
 * Stored shape to keep: timestamps inside a version doc are plain
 * `{seconds, nanoseconds}` maps (what the browser SDK's Timestamp flattened
 * to), and the readers in the service expect exactly that.
 */

export const VERSIONS_COLLECTION = "bookingVersions";

/** Returned instead of a doc when an update changed nothing worth recording. */
export const SKIPPED_VERSION = "__SKIPPED__";

/** The two Timestamp statics the builder needs, from whichever SDK the caller uses. */
export interface TimestampFactory {
  now(): unknown;
  fromDate(date: Date): unknown;
}

const isTimestampLike = (v: any): boolean =>
  !!v &&
  typeof v === "object" &&
  typeof v.toMillis === "function" &&
  typeof v.seconds === "number" &&
  typeof v.nanoseconds === "number";

/** Drops meaningless changes (missing → ""), keeping synthetic `_…` markers. */
export function sanitizeFieldChanges(changes: FieldChange[]): FieldChange[] {
  return changes.filter((change) => {
    const { fieldPath, oldValue, newValue } = change;
    if (fieldPath.startsWith("_")) return true;
    if ((oldValue === null || oldValue === undefined) && typeof newValue === "string" && newValue === "") {
      return false;
    }
    return true;
  });
}

/**
 * Removes undefined values recursively and turns every object into a plain
 * one. Timestamps become `{seconds, nanoseconds}`: the browser SDK's
 * Timestamp flattened to that on its own (own fields), firebase-admin's keeps
 * them behind getters and would otherwise become `{_seconds, _nanoseconds}`.
 */
export function removeUndefinedValues(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => removeUndefinedValues(item));
  if (isTimestampLike(obj)) return { seconds: obj.seconds, nanoseconds: obj.nanoseconds };
  if (typeof obj === "object") {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) cleaned[key] = removeUndefinedValues(value);
    }
    return cleaned;
  }
  return obj;
}

export function serializeValueForStorage(value: any, ts: TimestampFactory): any {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return ts.fromDate(value);
  if (value && typeof value === "object" && (typeof value.toDate === "function" || typeof value.toMillis === "function")) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeValueForStorage(item, ts)).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const serialized: Record<string, any> = {};
    Object.keys(value).forEach((key) => {
      const serializedValue = serializeValueForStorage(value[key], ts);
      if (serializedValue !== undefined) serialized[key] = serializedValue;
    });
    return serialized;
  }
  return value;
}

export function sanitizeSheetDataForStorage(data: SheetData, ts: TimestampFactory): Record<string, any> {
  const clone: Record<string, any> = { ...data };
  if (clone._versionInfo) delete clone._versionInfo;
  if (clone._originalRow) delete clone._originalRow;
  const cleaned: Record<string, any> = {};
  Object.keys(clone).forEach((key) => {
    const serializedValue = serializeValueForStorage(clone[key], ts);
    if (serializedValue !== undefined) cleaned[key] = serializedValue;
  });
  return cleaned;
}

export function sanitizeGridSnapshotForStorage(
  rows: SheetData[] | undefined,
  ts: TimestampFactory,
): SheetData[] | undefined {
  if (!rows) return undefined;
  return rows
    .map((row, index) => {
      const sanitized = sanitizeSheetDataForStorage(row, ts);
      if (!sanitized.id) sanitized.id = row.id || `grid-row-${index}`;
      return sanitized as SheetData;
    })
    .filter((row) => !!row.id);
}

/** Field changes to record for a version, synthesising markers for create/delete/restore. */
function changesFor(documentSnapshot: SheetData, options: CreateVersionOptions, columns?: any[]): FieldChange[] {
  let changes = options.changedFields || [];

  if (options.changeType === "create" && changes.length === 0) {
    changes = [
      { fieldPath: "_row_created", fieldName: "Row Created", oldValue: null, newValue: "Added new row", dataType: "string" },
    ];
  } else if (options.changeType === "delete" && changes.length === 0) {
    changes = [
      { fieldPath: "_row_deleted", fieldName: "Row Deleted", oldValue: "Row existed", newValue: null, dataType: "string" },
    ];
  } else if (options.changeType === "restore" && changes.length === 0) {
    changes = [
      {
        fieldPath: "_restore_operation",
        fieldName: "Restore Operation",
        oldValue: null,
        newValue: options.changeDescription || "Restored booking state from history",
        dataType: "string",
      },
    ];
  } else if (changes.length === 0 && options.changedFieldPaths && options.changedFieldPaths.length > 0) {
    changes = options.changedFieldPaths.map((fieldPath) => {
      const newValue = documentSnapshot[fieldPath as keyof SheetData];
      let dataType = "unknown";
      if (columns && columns.length > 0) {
        const column = columns.find((col) => col.id === fieldPath);
        if (column) dataType = column.dataType || "string";
      }
      if (dataType === "unknown") {
        if (typeof newValue === "number") dataType = "number";
        else if (typeof newValue === "boolean") dataType = "boolean";
        else if (newValue instanceof Date || (newValue && typeof newValue.toDate === "function")) dataType = "date";
        else if (typeof newValue === "string") dataType = "string";
      }
      return { fieldPath, fieldName: fieldPath, oldValue: null, newValue, dataType } as FieldChange;
    });
  }

  return sanitizeFieldChanges(changes);
}

/**
 * The `bookingVersions` document for one booking change, or SKIPPED_VERSION
 * when an update has no meaningful changes.
 */
export function buildVersionSnapshotDoc(
  bookingId: string,
  documentSnapshot: SheetData,
  options: CreateVersionOptions,
  ts: TimestampFactory,
  columns?: any[],
): Record<string, any> | typeof SKIPPED_VERSION {
  const versionNumber = Date.now() + Math.floor(Math.random() * 1000);
  const changes = changesFor(documentSnapshot, options, columns);
  if (options.changeType === "update" && changes.length === 0) return SKIPPED_VERSION;

  const branchId = options.isRestorePoint ? `restore-${Date.now()}-${bookingId}` : `main-${bookingId}`;
  const branchInfo: BranchInfo = {
    isMainBranch: !options.isRestorePoint,
    branchName: options.isRestorePoint ? "Restored Version" : undefined,
    hasChildBranches: false,
    childBranchIds: [],
  };

  const gridSnapshot = sanitizeGridSnapshotForStorage(options.gridSnapshot, ts);
  const previousGridSnapshot = sanitizeGridSnapshotForStorage(options.previousGridSnapshot, ts);

  const versionSnapshot: any = {
    bookingId,
    versionNumber,
    branchId,
    documentSnapshot: sanitizeSheetDataForStorage(documentSnapshot, ts),
    metadata: {
      createdAt: ts.now(),
      createdBy: options.userId,
      createdByName: options.userName,
      changeType: options.changeType,
      changeDescription: options.changeDescription,
      isRestorePoint: options.isRestorePoint || false,
    },
    changes,
    branchInfo: {
      isMainBranch: branchInfo.isMainBranch,
      hasChildBranches: branchInfo.hasChildBranches,
      childBranchIds: branchInfo.childBranchIds,
    },
  };
  if (gridSnapshot && gridSnapshot.length > 0) versionSnapshot.gridSnapshot = gridSnapshot;
  if (previousGridSnapshot && previousGridSnapshot.length > 0) {
    versionSnapshot.previousGridSnapshot = previousGridSnapshot;
  }
  if (options.restoredFromVersionId !== undefined) {
    versionSnapshot.metadata.restoredFromVersionId = options.restoredFromVersionId;
  }
  if (branchInfo.branchName !== undefined) versionSnapshot.branchInfo.branchName = branchInfo.branchName;

  return removeUndefinedValues(versionSnapshot);
}

/** The `bookingVersions` document recording a bulk operation. */
export function buildBulkOperationDoc(options: BulkOperationOptions, ts: TimestampFactory): Record<string, any> {
  const versionNumber = Date.now() + Math.floor(Math.random() * 1000);
  const bulkBookingId = `bulk_${options.operationType}_${Date.now()}`;
  const branchId = `bulk-${options.operationType}-${Date.now()}`;

  const changes: FieldChange[] = [
    {
      fieldPath: "_bulk_operation",
      fieldName: "Bulk Operation",
      oldValue: null,
      newValue: `${options.operationType}: ${options.operationDescription}`,
      dataType: "string",
    },
  ];

  const documentSnapshot = {
    id: bulkBookingId,
    createdAt: new Date(),
    updatedAt: new Date(),
    _bulkOperation: {
      type: options.operationType,
      description: options.operationDescription,
      totalCount: options.totalCount,
      successCount: options.successCount || 0,
      failureCount: options.failureCount || 0,
      affectedBookingIds: options.affectedBookingIds,
    },
  } as unknown as SheetData;

  const branchInfo: BranchInfo = {
    isMainBranch: true,
    branchName: `Bulk ${options.operationType}`,
    hasChildBranches: false,
    childBranchIds: [],
  };

  const metadata = {
    createdAt: ts.now(),
    createdBy: options.userId,
    createdByName: options.userName,
    changeType:
      options.operationType === "delete"
        ? "bulk_delete"
        : options.operationType === "import"
          ? "bulk_import"
          : "bulk_update",
    changeDescription: options.operationDescription,
    isRestorePoint: false,
    bulkOperation: {
      operationType: options.operationType,
      totalCount: options.totalCount,
      successCount: options.successCount || 0,
      failureCount: options.failureCount || 0,
      affectedBookingIds: options.affectedBookingIds,
    },
  } as unknown as BulkOperationMetadata;

  return removeUndefinedValues({
    bookingId: bulkBookingId,
    versionNumber,
    branchId,
    documentSnapshot,
    metadata,
    changes,
    branchInfo,
  });
}
