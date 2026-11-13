import { Suspense } from "react";
import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import EnquiriesList from "@/components/enquiries/EnquiriesList";

export const metadata: Metadata = {
  title: "Enquiries - ImHereTravels Admin",
  description: "Tour enquiries from the Inquire now buttons on imheretravels.com",
};

export default function EnquiriesPage() {
  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageTours">
        <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-hk-grotesk">Enquiries</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Leads from the Inquire now buttons on imheretravels.com sale cards and tour pages
            </p>
          </div>
          <Suspense fallback={null}>
            <EnquiriesList />
          </Suspense>
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
