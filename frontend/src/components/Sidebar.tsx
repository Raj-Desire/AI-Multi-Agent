import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  PhoneCall,
  PhoneOutgoing,
  Bot,
  Sliders,
  Palette,
  Users,
  ShieldAlert,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Laptop,
  AlertTriangle,
  Building2,
  BookOpen
} from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

export type NavTab = "dashboard" | "ai_dialer" | "voice_agent" | "business_profile" | "twilio" | "theme" | "admin" | "superadmin";

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavGroup {
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ElementType;
    visible: boolean;
    badge?: string;
  }[];
}

export function Sidebar({
  activeTab,
  onTabChange,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const { draftTheme, userPreferences, setUserPreferences } = useTheme();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const toggleColorMode = () => {
    const modes: ("system" | "light" | "dark")[] = ["light", "dark", "system"];
    const currentIdx = modes.indexOf(userPreferences.color_mode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    setUserPreferences({ color_mode: nextMode });
  };

  const navGroups: NavGroup[] = [
    {
      title: "Workspace",
      items: [
        {
          id: "dashboard",
          label: "Calling Console",
          icon: PhoneCall,
          visible: true,
        },
        {
          id: "ai_dialer",
          label: "AI Agent Dialer",
          icon: PhoneOutgoing,
          visible: true,
          badge: "AI",
        },
        {
          id: "voice_agent",
          label: "AI Voice Agents",
          icon: Bot,
          visible: true,
          badge: "Live",
        },
      ],
    },
    {
      title: "Configuration",
      items: [
        {
          id: "business_profile",
          label: "Company Knowledge",
          icon: Building2,
          visible: true,
          badge: "Brain",
        },
        {
          id: "twilio",
          label: "Phone & Voice",
          icon: Sliders,
          visible: isAdmin,
        },
      ],
    },
    {
      title: "Administration",
      items: [
        {
          id: "admin",
          label: "Team",
          icon: Users,
          visible: isAdmin,
        },
        {
          id: "theme",
          label: "Theme Studio",
          icon: Palette,
          visible: isAdmin,
        },
      ],
    },
    {
      title: "Super Admin",
      items: [
        {
          id: "superadmin",
          label: "Admin Control",
          icon: ShieldAlert,
          visible: isSuperAdmin,
          badge: "Root",
        },
      ],
    },
  ];

  const showNavLogo = draftTheme.identity.show_nav_logo !== false;
  const showNavTitle = draftTheme.identity.show_nav_title !== false;

  return (
    <aside
      style={{
        backgroundColor: "var(--color-sidebar)",
        color: "var(--color-sidebar-text)",
        borderColor: "var(--color-border)",
      }}
      className={`relative flex flex-col justify-between border-r transition-all duration-200 ease-in-out select-none z-30 shrink-0 h-screen sticky top-0 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Brand Header */}
      <div>
        <div
          className={`flex items-center px-3.5 h-14 border-b border-[var(--color-border)] ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {showNavLogo && (
              draftTheme.identity.logo_url ? (
                <img
                  src={draftTheme.identity.logo_url}
                  alt="Logo"
                  className="w-7 h-7 rounded-md object-contain border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 shrink-0"
                />
              ) : (
                <div
                  style={{ backgroundColor: "var(--color-primary)" }}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-white shrink-0 shadow-xs"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                </div>
              )
            )}

            {!collapsed && showNavTitle && (
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm tracking-tight truncate text-[var(--color-heading)] leading-none">
                  {draftTheme.identity.org_name || (user?.org_name || "Desire AI")}
                </div>
                <div className="text-[10px] text-[var(--color-muted)] truncate mt-1">
                  Voice Calling SaaS
                </div>
              </div>
            )}
          </div>

          {/* Collapse Toggle */}
          {onToggleCollapse && !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expand toggle when collapsed */}
        {onToggleCollapse && collapsed && (
          <div className="flex justify-center py-2 border-b border-[var(--color-border)]">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Grouped Navigation */}
        <nav className="p-2 space-y-4 overflow-y-auto">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.visible);
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                {!collapsed && (
                  <div className="px-2 py-1 text-[11px] font-medium text-[var(--color-muted)]">
                    {group.title}
                  </div>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      title={collapsed ? item.label : undefined}
                      style={{
                        backgroundColor: isActive ? "var(--color-primary-light)" : "transparent",
                        color: isActive ? "var(--color-primary)" : "var(--color-text)",
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] text-xs font-medium transition-colors cursor-pointer ${
                        collapsed ? "justify-center px-0 py-2" : "justify-start"
                      } ${
                        isActive
                          ? "font-semibold"
                          : "hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                        }`}
                        strokeWidth={1.75}
                      />

                      {!collapsed && (
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Utilities */}
      <div className="p-2 border-t border-[var(--color-border)] space-y-1.5 bg-[var(--color-surface-muted)]/30">
        {/* Color Mode Switcher */}
        <button
          type="button"
          onClick={toggleColorMode}
          title={`Theme: ${userPreferences.color_mode} (click to toggle)`}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
        >
          {userPreferences.color_mode === "light" ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {!collapsed && <span className="capitalize text-xs">Light</span>}
            </>
          ) : userPreferences.color_mode === "dark" ? (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              {!collapsed && <span className="capitalize text-xs">Dark</span>}
            </>
          ) : (
            <>
              <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {!collapsed && <span className="capitalize text-xs">System</span>}
            </>
          )}
        </button>

        {/* User Card */}
        <div
          className={`flex items-center gap-2 p-1.5 rounded-[var(--radius-main,0.375rem)] ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              style={{
                backgroundColor: "var(--color-primary-light)",
                color: "var(--color-primary)",
              }}
              className="w-6 h-6 rounded flex items-center justify-center font-medium text-xs shrink-0 uppercase"
            >
              {user?.username ? user.username.charAt(0) : "U"}
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--color-heading)] truncate leading-none">
                  {user?.username}
                </div>
                <div className="text-[10px] text-[var(--color-muted)] truncate capitalize mt-0.5">
                  {user?.role}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            title="Sign out"
            className="p-1 text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Sign Out Confirmation"
        description="Are you sure you want to log out of your account?"
        maxWidth="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowLogoutModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              leftIcon={<LogOut className="w-3.5 h-3.5" />}
              onClick={() => {
                setShowLogoutModal(false);
                logout();
              }}
            >
              Log Out
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-[var(--color-heading)]">
                {user?.username || "Active User"}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                {user?.email} • <span className="capitalize">{user?.role}</span>
              </p>
            </div>
          </div>
          <p className="text-[var(--color-muted)] leading-relaxed">
            You will be signed out of this workspace. Any unsaved live calls or unsaved changes in progress will end.
          </p>
        </div>
      </Modal>
    </aside>
  );
}
