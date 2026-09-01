import React, { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { SuperAdminPanel } from "./components/SuperAdminPanel";
import { DashboardView } from "./components/DashboardView";
import { TwilioSettingsView } from "./components/TwilioSettingsView";
import { ThemeStudioView } from "./components/ThemeStudioView";
import { VoiceAgentView } from "./components/VoiceAgentView";
import { AIAgentDialerView } from "./components/AIAgentDialerView";
import { AgentManagementView } from "./components/AgentManagementView";
import { BusinessProfileView } from "./components/BusinessProfileView";
import { ProspectsView } from "./components/prospects/ProspectsView";
import { CampaignsView } from "./components/campaigns/CampaignsView";
import { Sidebar, NavTab, TAB_ROUTE_MAP, ROUTE_TAB_MAP } from "./components/Sidebar";
import { LoadingState } from "./components/ui/LoadingState";
import { Modal } from "./components/ui/Modal";
import { Button } from "./components/ui/Button";
import { Toaster, toast } from "sonner";
import {
  Menu,
  PhoneCall,
  PhoneOutgoing,
  Bot,
  Megaphone,
  Sliders,
  Palette,
  Users,
  UserCheck,
  ShieldAlert,
  Building2,
  AlertCircle,
  Save
} from "lucide-react";

function MainContent() {
  const { user, isLoading: isAuthLoading, isAdmin, isSuperAdmin } = useAuth();
  const { draftTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [activeDialerAgentId, setActiveDialerAgentId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Unsaved Editor Changes Global Interception State (Agents & Campaigns)
  const [isAgentEditorDirty, setIsAgentEditorDirty] = useState(false);
  const [isCampaignEditorDirty, setIsCampaignEditorDirty] = useState(false);
  const [saveDraftFn, setSaveDraftFn] = useState<(() => Promise<void>) | null>(null);
  const [discardDraftFn, setDiscardDraftFn] = useState<(() => void) | null>(null);
  const [pendingTargetRoute, setPendingTargetRoute] = useState<string | null>(null);
  const [showNavConfirmModal, setShowNavConfirmModal] = useState(false);
  const [navConfirmSource, setNavConfirmSource] = useState<"agent" | "campaign">("agent");

  // Determine current active NavTab from URL path
  const currentPath = location.pathname.toLowerCase().replace(/\/$/, "") || "/";
  const activeTab: NavTab = ROUTE_TAB_MAP[currentPath] || "dashboard";

  const handleTabSelect = (tab: NavTab) => {
    const targetRoute = TAB_ROUTE_MAP[tab] || "/dashboard";
    if (activeTab === "voice_agent" && isAgentEditorDirty && tab !== "voice_agent") {
      setNavConfirmSource("agent");
      setPendingTargetRoute(targetRoute);
      setShowNavConfirmModal(true);
    } else if (activeTab === "campaigns" && isCampaignEditorDirty && tab !== "campaigns") {
      setNavConfirmSource("campaign");
      setPendingTargetRoute(targetRoute);
      setShowNavConfirmModal(true);
    } else {
      navigate(targetRoute);
    }
  };

  // When verifying auth session
  if (isAuthLoading) {
    return (
      <LoadingState
        fullPage
        message="Loading workspace session..."
        subMessage="Signing into your voice workspace"
        size="md"
      />
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Guard tab access based on role
  let currentTab = activeTab;
  if (currentTab === "superadmin" && !isSuperAdmin) {
    currentTab = "dashboard";
  } else if ((currentTab === "admin" || currentTab === "theme" || currentTab === "twilio") && !isAdmin) {
    currentTab = "dashboard";
  }

  const getPageTitle = () => {
    switch (currentTab) {
      case "dashboard":
        return {
          title: "Calling Console",
          sub: "Standard WebRTC Direct Dialing & Call History",
          icon: PhoneCall,
        };
      case "ai_dialer":
        return {
          title: "AI Voice Agent Dialer",
          sub: "Conversational AI voice dispatching & live telemetry",
          icon: PhoneOutgoing,
        };
      case "voice_agent":
        return {
          title: "AI Voice Agents",
          sub: "Configure, test, and manage your organization's AI voice agents.",
          icon: Bot,
        };
      case "campaigns":
        return {
          title: "Outbound Campaigns",
          sub: "Automated dialer scheduler, audience queues & AI voice dispatching",
          icon: Megaphone,
        };
      case "prospects":
        return {
          title: "Contacts & Leads",
          sub: "Unified audience registry, custom attributes, DNC compliance & calling",
          icon: UserCheck,
        };
      case "business_profile":
        return {
          title: "Company Knowledge Base",
          sub: "Business identity, services, office address & working hours for AI calls",
          icon: Building2,
        };
      case "twilio":
        return {
          title: "Phone & Voice",
          sub: "Twilio credentials, active numbers & call routing",
          icon: Sliders,
        };
      case "theme":
        return {
          title: "Theme Studio",
          sub: "White-label design tokens and UI architecture styles",
          icon: Palette,
        };
      case "admin":
        return {
          title: "Team Administration",
          sub: "Manage workspace members, roles & credentials",
          icon: Users,
        };
      case "superadmin":
        return {
          title: "Admin Control",
          sub: "Multi-tenant root governance and platform telemetries",
          icon: ShieldAlert,
        };
      default:
        return {
          title: "Calling Console",
          sub: "Voice Calling Platform",
          icon: PhoneCall,
        };
    }
  };

  const pageMeta = getPageTitle();
  const HeaderIcon = pageMeta.icon;

  return (
    <div className="min-h-screen flex bg-[var(--color-background)] text-[var(--color-text)] transition-colors">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          activeTab={currentTab}
          onTabChange={handleTabSelect}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 md:hidden flex"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            className="w-64 h-full bg-[var(--color-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar
              activeTab={currentTab}
              onTabChange={(tab) => {
                handleTabSelect(tab);
                setMobileSidebarOpen(false);
              }}
              collapsed={false}
              onToggleCollapse={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shadow-2xs">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-heading)] hover:bg-[var(--color-surface)] cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumb Header */}
            <div className="flex items-center gap-2">
              <HeaderIcon className="w-4 h-4 text-[var(--color-muted)] hidden sm:block" />
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                <span className="font-medium text-[var(--color-heading)]">{pageMeta.title}</span>
                <span className="opacity-40 hidden sm:inline">&bull;</span>
                <span className="hidden sm:inline text-[11px]">{pageMeta.sub}</span>
              </div>
            </div>
          </div>

          {/* Right Status Indicators */}
          <div className="flex items-center gap-2.5">
            {/* Tenant Organization */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
              <span>Org: <strong className="text-[var(--color-heading)] font-medium">{user.org_name || draftTheme.identity.org_name || "AI Voice Platform"}</strong></span>
            </div>
          </div>
        </header>

        {/* Dynamic Route View - Full Width & Fully Responsive */}
        <main className="flex-1 w-full max-w-full px-3 sm:px-5 lg:px-7 py-4 sm:py-6 text-left">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={<DashboardView onNavigateSettings={() => handleTabSelect("twilio")} />}
            />
            <Route
              path="/dialer"
              element={
                <AIAgentDialerView
                  initialAgentId={activeDialerAgentId}
                  onNavigateSettings={() => handleTabSelect("twilio")}
                  onNavigateAgents={() => handleTabSelect("voice_agent")}
                />
              }
            />
            <Route path="/ai-dialer" element={<Navigate to="/dialer" replace />} />
            <Route
              path="/agents"
              element={
                <AgentManagementView
                  onNavigateToDialer={(agentId) => {
                    setActiveDialerAgentId(agentId);
                    handleTabSelect("ai_dialer");
                  }}
                  onEditorDirtyChange={(isDirty, handleSaveDraft, handleDiscard) => {
                    setIsAgentEditorDirty(isDirty);
                    setSaveDraftFn(() => handleSaveDraft);
                    setDiscardDraftFn(() => handleDiscard);
                  }}
                />
              }
            />
            <Route path="/voice-agents" element={<Navigate to="/agents" replace />} />
            <Route
              path="/campaigns"
              element={
                <CampaignsView
                  onEditorDirtyChange={(isDirty, handleSaveDraft, handleDiscard) => {
                    setIsCampaignEditorDirty(isDirty);
                    setSaveDraftFn(() => handleSaveDraft);
                    setDiscardDraftFn(() => handleDiscard);
                  }}
                />
              }
            />
            <Route path="/prospects" element={<ProspectsView />} />
            <Route path="/contacts" element={<Navigate to="/prospects" replace />} />
            <Route path="/knowledge" element={<BusinessProfileView />} />
            <Route path="/company-profile" element={<Navigate to="/knowledge" replace />} />
            <Route
              path="/phone-settings"
              element={isAdmin ? <TwilioSettingsView /> : <Navigate to="/dashboard" replace />}
            />
            <Route path="/twilio" element={<Navigate to="/phone-settings" replace />} />
            <Route
              path="/theme"
              element={isAdmin ? <ThemeStudioView /> : <Navigate to="/dashboard" replace />}
            />
            <Route
              path="/team"
              element={isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" replace />}
            />
            <Route path="/admin" element={<Navigate to="/team" replace />} />
            <Route
              path="/superadmin"
              element={isSuperAdmin ? <SuperAdminPanel /> : <Navigate to="/dashboard" replace />}
            />
            {/* Catch all route - redirect to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>

        {/* Unsaved Agent / Campaign Navigation Confirmation Modal */}
        <Modal
          isOpen={showNavConfirmModal}
          onClose={() => setShowNavConfirmModal(false)}
          title={navConfirmSource === "campaign" ? "Unsaved Campaign Setup" : "Unsaved Voice Agent Changes"}
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[var(--color-warning-subtle)] border border-[var(--color-warning)]/30 rounded-[var(--radius-main,0.375rem)] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[var(--color-heading)]">
                  Are you sure you want to leave this page?
                </p>
                <p className="text-[var(--color-muted)] leading-relaxed">
                  {navConfirmSource === "campaign"
                    ? "Your campaign setup has unsaved changes. Would you like to save this campaign as a draft before navigating away, or discard your current setup?"
                    : "Your voice agent changes are not saved yet. Would you like to save this as a draft before navigating away, or discard your current edits?"}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNavConfirmModal(false);
                  setPendingTargetRoute(null);
                }}
                className="w-full sm:w-auto cursor-pointer"
              >
                Keep Editing
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (discardDraftFn) discardDraftFn();
                  setShowNavConfirmModal(false);
                  setIsAgentEditorDirty(false);
                  setIsCampaignEditorDirty(false);
                  if (pendingTargetRoute) navigate(pendingTargetRoute);
                  setPendingTargetRoute(null);
                }}
                className="w-full sm:w-auto cursor-pointer"
              >
                Discard &amp; Leave
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (saveDraftFn) {
                    await saveDraftFn();
                  }
                  setShowNavConfirmModal(false);
                  setIsAgentEditorDirty(false);
                  setIsCampaignEditorDirty(false);
                  if (pendingTargetRoute) navigate(pendingTargetRoute);
                  setPendingTargetRoute(null);
                }}
                leftIcon={<Save className="w-3.5 h-3.5" />}
                className="w-full sm:w-auto cursor-pointer font-semibold"
              >
                Save Draft &amp; Leave
              </Button>
            </div>
          </div>
        </Modal>

        {/* Minimal Footer */}
        <footer className="bg-[var(--color-surface)]/60 border-t border-[var(--color-border)] px-4 sm:px-6 py-3 text-xs text-[var(--color-muted)] flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>
            &copy; 2026 {draftTheme.identity.org_name || (user.org_name || "AI Voice Platform")}. All rights reserved.
          </div>
          <div className="flex items-center gap-2.5 text-[11px] opacity-75">
            <span>Multi-Tenant Architecture</span>
            <span>&bull;</span>
            <span>WebRTC Gateway v2.11</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <MainContent />
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
              className: "text-xs font-sans shadow-lg border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]"
            }}
          />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
