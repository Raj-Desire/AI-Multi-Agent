import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  PhoneCall,
  Activity,
  Settings,
  Palette,
  ShieldCheck,
  Crown,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Laptop,
  Radio,
} from "lucide-react";

export type NavTab = "dashboard" | "twilio" | "theme" | "admin" | "superadmin";

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const { draftTheme, userPreferences, setUserPreferences } = useTheme();

  const toggleColorMode = () => {
    const modes: ("system" | "light" | "dark")[] = ["light", "dark", "system"];
    const currentIdx = modes.indexOf(userPreferences.color_mode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    setUserPreferences({ color_mode: nextMode });
  };

  const navItems = [
    {
      id: "dashboard" as NavTab,
      label: "Calling Console",
      subLabel: "Live dialer & call logs",
      icon: Activity,
      visible: true,
      badge: "Live",
    },
    {
      id: "twilio" as NavTab,
      label: "Twilio Voice",
      subLabel: "Credentials, numbers & rules",
      icon: Settings,
      visible: isAdmin,
    },
    {
      id: "theme" as NavTab,
      label: "Theme Studio",
      subLabel: "Styles, colors & typography",
      icon: Palette,
      visible: isAdmin,
      badge: "8 Styles",
    },
    {
      id: "admin" as NavTab,
      label: "User Admin",
      subLabel: "Member roles & accounts",
      icon: ShieldCheck,
      visible: isAdmin,
    },
    {
      id: "superadmin" as NavTab,
      label: "Master Console",
      subLabel: "Multi-tenant root controls",
      icon: Crown,
      visible: isSuperAdmin,
      isSuperAdminOnly: true,
    },
  ];

  const showNavLogo = draftTheme.identity.show_nav_logo !== false;
  const showNavTitle = draftTheme.identity.show_nav_title !== false;

  return (
    <aside
      style={{
        backgroundColor: "var(--color-sidebar, #faf9fa)",
        color: "var(--color-sidebar-text, #0f172a)",
        borderColor: "var(--color-border, #e2e8f0)",
      }}
      className={`relative flex flex-col justify-between border-r transition-all duration-300 ease-in-out select-none z-30 shrink-0 h-screen sticky top-0 ${
        collapsed ? "w-20" : "w-68"
      }`}
    >
      {/* Top Header Section: Brand Logo & Title */}
      <div>
        <div
          className={`flex items-center gap-3 px-4 py-5 border-b border-slate-200/80 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {showNavLogo && (
              draftTheme.identity.logo_url ? (
                <img
                  src={draftTheme.identity.logo_url}
                  alt="Org Logo"
                  className="w-10 h-10 rounded-xl object-contain border border-slate-200 shadow-xs bg-white p-0.5 shrink-0"
                />
              ) : (
                <div
                  style={{ backgroundColor: draftTheme.colors.primary }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0"
                >
                  <PhoneCall className="w-5 h-5" />
                </div>
              )
            )}

            {!collapsed && showNavTitle && (
              <div className="min-w-0 flex-1">
                <div
                  style={{ color: draftTheme.colors.primary }}
                  className="font-black text-base tracking-tight truncate leading-tight"
                >
                  {draftTheme.identity.org_name || (user?.org_name || "Desire AI")}
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  Voice Agent Platform
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Collapse/Expand Toggle Button */}
          {onToggleCollapse && !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg border border-slate-200/80 text-slate-400 hover:text-slate-700 hover:bg-slate-100 bg-white transition-all cursor-pointer shadow-2xs"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapsed Expand Toggle Bar */}
        {onToggleCollapse && collapsed && (
          <div className="flex justify-center pt-2 pb-1">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg border border-slate-200/80 text-slate-400 hover:text-slate-700 hover:bg-slate-100 bg-white transition-all cursor-pointer shadow-2xs"
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Category Label */}
        {!collapsed && (
          <div className="px-5 pt-5 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Navigation Menu
          </div>
        )}

        {/* Navigation Items List */}
        <nav className="px-3 space-y-1.5 mt-2">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const isSuper = item.isSuperAdminOnly;

              const activeBg = isSuper
                ? "#fef3c7"
                : `${draftTheme.colors.primary}18`;
              const activeColor = isSuper
                ? "#b45309"
                : draftTheme.colors.primary;
              const activeBorder = isSuper
                ? "#f59e0b50"
                : `${draftTheme.colors.primary}35`;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  title={collapsed ? `${item.label} - ${item.subLabel}` : undefined}
                  style={{
                    backgroundColor: isActive ? activeBg : "transparent",
                    color: isActive ? activeColor : "inherit",
                    borderColor: isActive ? activeBorder : "transparent",
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border group ${
                    collapsed ? "justify-center px-0 py-3" : "justify-start"
                  } ${
                    isActive
                      ? "shadow-2xs font-extrabold"
                      : "hover:bg-slate-200/50 text-slate-600 hover:text-slate-900 border-transparent"
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-lg transition-all shrink-0 ${
                      isActive
                        ? "bg-white shadow-2xs"
                        : "bg-transparent group-hover:bg-white/80"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        isActive
                          ? isSuper
                            ? "text-amber-600"
                            : "theme-primary-text"
                          : "text-slate-500 group-hover:text-slate-800"
                      }`}
                    />
                  </div>

                  {!collapsed && (
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate leading-tight">{item.label}</span>
                        {item.badge && (
                          <span
                            style={{
                              backgroundColor: `${draftTheme.colors.primary}15`,
                              color: draftTheme.colors.primary,
                            }}
                            className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-md uppercase tracking-wider"
                          >
                            {item.badge}
                          </span>
                        )}
                        {isSuper && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 uppercase tracking-wider">
                            Root
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-normal text-slate-400 truncate mt-0.5">
                        {item.subLabel}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
        </nav>
      </div>

      {/* Bottom Section: User Profile & Utility Controls */}
      <div className="p-3 border-t border-slate-200/80 space-y-2 bg-slate-50/50">
        {/* Personal Color Mode & Status Controls */}
        <div
          className={`flex items-center gap-2 ${
            collapsed ? "flex-col justify-center" : "justify-between"
          }`}
        >
          {/* Quick Color Mode Toggle */}
          <button
            type="button"
            onClick={toggleColorMode}
            title={`Mode: ${userPreferences.color_mode} (Click to switch)`}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200/80 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-[11px] font-semibold transition-all cursor-pointer shadow-2xs w-full justify-center"
          >
            {userPreferences.color_mode === "light" ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                {!collapsed && <span>Light Mode</span>}
              </>
            ) : userPreferences.color_mode === "dark" ? (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                {!collapsed && <span>Dark Mode</span>}
              </>
            ) : (
              <>
                <Laptop className="w-3.5 h-3.5 text-slate-500" />
                {!collapsed && <span>System Sync</span>}
              </>
            )}
          </button>
        </div>

        {/* User Profile Card & Role */}
        <div
          className={`flex items-center gap-2.5 p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs ${
            collapsed ? "justify-center flex-col p-1.5" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              style={{
                backgroundColor: `${draftTheme.colors.primary}20`,
                color: draftTheme.colors.primary,
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 uppercase"
            >
              {user?.username ? user.username.charAt(0) : "U"}
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate leading-tight">
                  {user?.username}
                </div>
                <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                  <span
                    style={{
                      backgroundColor:
                        user?.role === "superadmin"
                          ? "#fef3c7"
                          : `${draftTheme.colors.primary}18`,
                      color:
                        user?.role === "superadmin"
                          ? "#b45309"
                          : draftTheme.colors.primary,
                    }}
                    className="font-extrabold uppercase text-[9px] px-1.5 py-0.2 rounded"
                  >
                    {user?.role}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Logout Action */}
          <button
            type="button"
            onClick={logout}
            title="Sign Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
