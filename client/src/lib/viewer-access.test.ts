import { describe, expect, it } from "vitest";
import { VIEWER_PERMISSIONS, isViewerRole, viewerMayOpen } from "./viewer-access";

describe("viewer access", () => {
  it("opens the four pages and what's under them", () => {
    for (const p of ["/bookings", "/bookings/fullscreen", "/tours", "/tours?tab=packages", "/enquiries", "/transactions", "/tours/sales/abc/edit"]) {
      expect(viewerMayOpen(p), p).toBe(true);
    }
  });

  it("keeps out create/edit forms and every other page", () => {
    for (const p of ["/tours/new", "/tours/sales/new", "/tours/abc/edit", "/dashboard", "/partnerships", "/settings", "/mail", "/reports", "/toursx", "/bookingsx"]) {
      expect(viewerMayOpen(p), p).toBe(false);
    }
  });

  it("only page flags for Bookings and Tours are on", () => {
    expect(Object.entries(VIEWER_PERMISSIONS).filter(([, on]) => on).map(([k]) => k)).toEqual(["canManageBookings", "canManageTours"]);
    expect(isViewerRole("viewer")).toBe(true);
    expect(isViewerRole("agent")).toBe(false);
  });
});
