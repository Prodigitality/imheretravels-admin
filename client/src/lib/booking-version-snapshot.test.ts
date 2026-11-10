import { describe, expect, it } from "vitest";
import { Timestamp as ClientTimestamp } from "firebase/firestore";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import {
  SKIPPED_VERSION,
  buildBulkOperationDoc,
  buildVersionSnapshotDoc,
  removeUndefinedValues,
  type TimestampFactory,
} from "@/lib/booking-version-snapshot";

const fixed = { seconds: 1_790_000_000, nanoseconds: 123_000_000 };
const clientTs: TimestampFactory = {
  now: () => new ClientTimestamp(fixed.seconds, fixed.nanoseconds),
  fromDate: (d) => ClientTimestamp.fromDate(d),
};
const adminTs: TimestampFactory = {
  now: () => new AdminTimestamp(fixed.seconds, fixed.nanoseconds),
  fromDate: (d) => AdminTimestamp.fromDate(d),
};

const strip = (d: any) => ({ ...d, versionNumber: 0 });

describe("booking-version-snapshot", () => {
  it("stores both SDKs' timestamps as the same {seconds, nanoseconds} map", () => {
    expect(removeUndefinedValues({ t: new ClientTimestamp(5, 6) })).toEqual({ t: { seconds: 5, nanoseconds: 6 } });
    expect(removeUndefinedValues({ t: new AdminTimestamp(5, 6) })).toEqual({ t: { seconds: 5, nanoseconds: 6 } });
  });

  it("writes the same version document from the browser and from firebase-admin", () => {
    const tourDate = new Date("2027-02-18T00:00:00Z");
    const booking = (T: any) => ({
      id: "b1",
      firstName: "Ana",
      tourDate: new T(1_800_000_000, 0),
      reservationDate: tourDate,
      notes: undefined,
    });
    const options = {
      changeType: "update" as const,
      changeDescription: "Updated field firstName",
      userId: "staff-1",
      userName: "Staff One",
      changedFieldPaths: ["firstName"],
    };
    const fromClient = buildVersionSnapshotDoc("b1", booking(ClientTimestamp) as any, options, clientTs);
    const fromAdmin = buildVersionSnapshotDoc("b1", booking(AdminTimestamp) as any, options, adminTs);
    expect(strip(fromAdmin)).toEqual(strip(fromClient));
    expect((fromAdmin as any).metadata.createdAt).toEqual(fixed);
    expect((fromAdmin as any).documentSnapshot.tourDate).toEqual({ seconds: 1_800_000_000, nanoseconds: 0 });
    expect((fromAdmin as any).documentSnapshot.reservationDate).toEqual({
      seconds: tourDate.getTime() / 1000,
      nanoseconds: 0,
    });
    expect("notes" in (fromAdmin as any).documentSnapshot).toBe(false);
    expect((fromAdmin as any).branchId).toBe("main-b1");
    expect((fromAdmin as any).changes).toEqual([
      { fieldPath: "firstName", fieldName: "firstName", oldValue: null, newValue: "Ana", dataType: "string" },
    ]);
  });

  it("skips updates whose only changes are missing → empty string", () => {
    const doc = buildVersionSnapshotDoc(
      "b1",
      { id: "b1" } as any,
      {
        changeType: "update",
        changeDescription: "x",
        userId: "u",
        userName: "n",
        changedFields: [{ fieldPath: "notes", fieldName: "notes", oldValue: null, newValue: "", dataType: "string" }],
      },
      adminTs,
    );
    expect(doc).toBe(SKIPPED_VERSION);
  });

  it("adds a row marker for create and delete", () => {
    const base = { changeDescription: "x", userId: "u", userName: "n" };
    const created = buildVersionSnapshotDoc("b1", { id: "b1" } as any, { ...base, changeType: "create" }, adminTs) as any;
    const deleted = buildVersionSnapshotDoc("b1", { id: "b1" } as any, { ...base, changeType: "delete" }, adminTs) as any;
    expect(created.changes[0].fieldPath).toBe("_row_created");
    expect(deleted.changes[0].fieldPath).toBe("_row_deleted");
  });

  it("builds bulk-delete docs the same way from both SDKs", () => {
    const opts = {
      operationType: "delete" as const,
      operationDescription: "Bulk delete of all 2 bookings",
      affectedBookingIds: ["a", "b"],
      userId: "staff-1",
      userName: "Staff One",
      totalCount: 2,
    };
    const a = buildBulkOperationDoc(opts, adminTs) as any;
    const c = buildBulkOperationDoc(opts, clientTs) as any;
    const norm = (d: any) => ({ ...d, versionNumber: 0, bookingId: "x", branchId: "x", documentSnapshot: { ...d.documentSnapshot, id: "x" } });
    expect(norm(a)).toEqual(norm(c));
    expect(a.metadata.changeType).toBe("bulk_delete");
    expect(a.metadata.createdAt).toEqual(fixed);
  });
});
