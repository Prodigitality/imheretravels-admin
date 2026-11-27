import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import WebsiteVisitsStaff from "@/components/reports/WebsiteVisitsStaff";

export const metadata: Metadata = {
  title: "Website visits - ImHereTravels Admin",
  description: "Cookie-free sale page visits next to GA4, per Manila day",
};

export default function WebsiteVisitsReportPage() {
  return (
    <DashboardLayout>
      <WebsiteVisitsStaff />
    </DashboardLayout>
  );
}
