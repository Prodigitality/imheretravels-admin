import { Timestamp } from "firebase/firestore";

// ============================================================================
// USER CORE TYPES
// ============================================================================

export interface User {
  id: string; // Matches Firebase Auth UID
  email: string;
  /** viewer: read-only staff (lib/viewer-access.ts). */
  role: UserRole;
  profile: UserProfile;
  permissions: UserPermissions;
  preferences: UserPreferences;
  security: UserSecurity;
  metadata: UserMetadata;
  isApproved: boolean;
  hasAgreedToTerms: boolean;
  isEmailVerified: boolean;
  /** Set when an admin invited the account (Settings → User Management). */
  invitedAt?: Timestamp;
  invitedBy?: string;
}

// ============================================================================
// USER PROFILE TYPES
// ============================================================================

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string; // Storage path
  timezone: string; // e.g., "Asia/Manila"
}

export interface UserPermissions {
  canManageBookings: boolean;
  canManageTours: boolean;
  canManageTemplates: boolean;
  canManageUsers: boolean; // Admins only
  canManagePaymentTypes: boolean;
  canManageStorage: boolean;
  canManageFunctions: boolean;
  canManageEmails: boolean;
  canManageBcc: boolean;
}

export interface UserPreferences {
  notifications: {
    newBookings: boolean;
    payments: boolean;
    cancellations: boolean;
  };
  columnsMetadata?: {
    widths?: Record<string, number>; // Column ID -> width in pixels
    order?: string[]; // Array of column IDs in display order
    visibility?: Record<string, boolean>; // Column ID -> visible/hidden
    frozen?: string[]; // Array of frozen column IDs
  };
}

export interface UserSecurity {
  lastLogin: Timestamp;
  lastPasswordReset: Timestamp;
  twoFactorEnabled: boolean;
}

export interface UserMetadata {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean;
}

// ============================================================================
// USER ROLE TYPES
// ============================================================================

/** viewer: approved read-only access to a few pages (lib/viewer-access.ts). */
export type UserRole = "admin" | "agent" | "viewer";

export interface RolePermissions {
  admin: UserPermissions;
  agent: UserPermissions;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface UserFormData {
  email: string;
  role: "admin" | "agent";
  profile: {
    firstName: string;
    lastName: string;
    timezone: string;
  };
  permissions: UserPermissions;
}

export interface UserProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
  timezone: string;
  avatar?: File;
}

export interface UserPreferencesFormData {
  notifications: {
    newBookings: boolean;
    payments: boolean;
    cancellations: boolean;
  };
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  emailVerified: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface PasswordResetData {
  email: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ============================================================================
// USER STATUS TYPES
// ============================================================================

export type UserStatus = "active" | "inactive" | "suspended";

export type UserActivity = "online" | "offline" | "away";

// ============================================================================
// FILTER AND SEARCH TYPES
// ============================================================================

export interface UserFilters {
  role?: UserRole;
  status?: UserStatus;
  activity?: UserActivity;
  search?: string;
}

export interface UserSearchParams {
  query: string;
  filters: UserFilters;
  sortBy: "name" | "email" | "role" | "lastLogin" | "createdAt";
  sortOrder: "asc" | "desc";
  page: number;
  limit: number;
}
