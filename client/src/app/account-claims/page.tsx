import { Suspense } from "react";
import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import AccountClaimsList from "@/components/account-claims/AccountClaimsList";

export const metadata: Metadata = {
  title: "Account claims - ImHereTravels Admin",
  description: "Customer-portal bookings that need a person to confirm who they belong to",
};

export default function AccountClaimsPage() {
  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageBookings">
        <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-hk-grotesk">Account claims</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Customers asking for a booking to be added to their account when we couldn&apos;t match it automatically.
              Reply within 2 working days.
            </p>
          </div>
          <Suspense fallback={null}>
            <AccountClaimsList />
          </Suspense>
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
