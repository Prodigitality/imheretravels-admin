import { Suspense } from "react";
import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import PartnershipsList from "@/components/partnerships/PartnershipsList";

export const metadata: Metadata = {
  title: "Partnerships - ImHereTravels Admin",
  description: "Host, affiliate and supplier applications from the Work With Us page",
};

export default function PartnershipsPage() {
  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageTours">
        <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-hk-grotesk">Partnerships</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Host, affiliate and supplier applications from imheretravels.com/work-with-us
            </p>
          </div>
          <Suspense fallback={null}>
            <PartnershipsList />
          </Suspense>
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
