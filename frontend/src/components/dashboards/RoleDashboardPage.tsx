import React from "react";
import { useAuth } from "../../context/AuthContext";
import { SuperadminDashboardView } from "./SuperadminDashboardView";
import { AdminDashboardView } from "./AdminDashboardView";

interface RoleDashboardPageProps {
  onNavigateTab?: (tab: string) => void;
  onStartDialer?: (phoneNumber: string) => void;
  onNavigateTenant?: (orgId: string) => void;
}

/**
 * Dedicated Dashboard Page:
 * - Superadmin sees Superadmin platform infrastructure & unit economics
 * - Admin and Users both see the unified operational performance dashboard,
 *   including live ROI metrics, conversational outcomes, active AI fleet,
 *   and full User Campaign Call History.
 */
export const RoleDashboardPage: React.FC<RoleDashboardPageProps> = ({
  onNavigateTab,
  onStartDialer,
  onNavigateTenant
}) => {
  const { isSuperAdmin } = useAuth();

  if (isSuperAdmin) {
    return <SuperadminDashboardView onNavigateTenant={onNavigateTenant} />;
  }

  // Admin and User both see the same unified operational dashboard
  return (
    <AdminDashboardView
      onNavigateTab={onNavigateTab}
      onStartDialer={onStartDialer}
    />
  );
};
