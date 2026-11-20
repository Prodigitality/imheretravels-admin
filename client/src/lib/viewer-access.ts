/**
 * The "viewer" role: approved, read-only access to a few admin pages
 * (set up 2026-11-20 for WaveX, the ad agency, at Bella's request).
 *
 * Enforced in three places, so the UI is only a convenience:
 *  - firestore.rules: viewers may read VIEWER_COLLECTIONS and write nothing;
 *  - API routes: requireStaff() refuses viewers unless a read route opts in
 *    with { allowViewer: true };
 *  - here: PermissionGuard, DashboardLayout (redirect + read-only banner) and
 *    the sidebar only offer VIEWER_PAGES.
 * Shared by server and browser code; keep it free of Firebase imports.
 */

import type { UserPermissions } from "@/types/users";

/** Pages a viewer may open (path prefixes). */
export const VIEWER_PAGES = ["/bookings", "/tours", "/enquiries", "/transactions"] as const;

/**
 * Permission flags for a viewer. They open the pages above; the role makes
 * them read-only. Everything else stays off.
 */
export const VIEWER_PERMISSIONS: UserPermissions = {
  canManageBookings: true,
  canManageTours: true,
  canManageTemplates: false,
  canManageUsers: false,
  canManagePaymentTypes: false,
  canManageStorage: false,
  canManageFunctions: false,
  canManageEmails: false,
  canManageBcc: false,
};

export const isViewerRole = (role: unknown) => role === "viewer";

/**
 * Create/edit forms under the viewer's pages. The sale editor stays open (its
 * "Track slots" panel); its saves are refused by the API.
 */
const VIEWER_BLOCKED = [/^\/tours\/new\/?$/, /^\/tours\/sales\/new\/?$/, /^\/tours\/(?!sales\/)[^/]+\/edit\/?$/];

/** Whether a viewer may open this path. Everyone else: not decided here. */
export function viewerMayOpen(pathname: string): boolean {
  const path = pathname.split("?")[0];
  if (VIEWER_BLOCKED.some((re) => re.test(path))) return false;
  return VIEWER_PAGES.some((p) => path === p || path.startsWith(`${p}/`));
}
