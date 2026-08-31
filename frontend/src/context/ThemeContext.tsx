import React, { createContext, useContext, useState, useEffect } from "react";
import { OrganizationThemeConfig, UserPreferences, ColorMode, UIDensity } from "../types";
import { applyThemeToCss } from "../utils/themeUtils";
import { fetchApi } from "../api-client";
import { useAuth } from "./AuthContext";

export const DEFAULT_ORG_THEME: OrganizationThemeConfig = {
  organization_id: "default",
  identity: {
    org_name: "AI Voice Platform",
    logo_url: null,
    logo_dark_url: null,
    favicon_url: null,
    show_nav_logo: true,
    show_nav_title: true,
  },
  colors: {
    primary: "#4f46e5",
    primary_hover: "#4338ca",
    secondary: "#0ea5e9",
    accent: "#8b5cf6",
    background: "#ffffff",
    surface: "#ffffff",
    sidebar: "#faf9fa",
    sidebar_text: "#0f172a",
    heading: "#0f172a",
    text: "#1e293b",
    text_muted: "#475569",
    border: "#e2e8f0",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#3b82f6",
  },
  appearance: {
    ui_style: "default",
    border_radius: "md",
    ui_density: "comfortable",
    color_mode: "light",
  },
  typography: {
    font_family: "Inter",
    font_scale: "md",
  },
};

interface ThemeContextType {
  theme: OrganizationThemeConfig; // Saved active organization theme
  draftTheme: OrganizationThemeConfig; // Studio preview theme (may contain unsaved changes)
  userPreferences: UserPreferences;
  isDirty: boolean;
  isLoading: boolean;
  isThemeReady: boolean;
  setDraftTheme: React.Dispatch<React.SetStateAction<OrganizationThemeConfig>>;
  updateDraftTheme: (updater: (prev: OrganizationThemeConfig) => OrganizationThemeConfig) => void;
  saveTheme: () => Promise<void>;
  discardChanges: () => void;
  resetToDefault: () => Promise<void>;
  setUserPreferences: (prefs: Partial<UserPreferences>) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_CACHE_KEY = "desire_cached_org_theme";
const THEME_CACHE_KEY_PREFIX = "desire_cached_org_theme_";

function getCachedTheme(orgId?: string): OrganizationThemeConfig {
  try {
    const key = orgId ? `${THEME_CACHE_KEY_PREFIX}${orgId}` : "desire_cached_org_theme";
    const saved = localStorage.getItem(key) || localStorage.getItem("desire_cached_org_theme");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.colors && parsed.appearance) {
        return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_ORG_THEME;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [theme, setTheme] = useState<OrganizationThemeConfig>(() => getCachedTheme(user?.organization_id));
  const [draftTheme, setDraftTheme] = useState<OrganizationThemeConfig>(() => getCachedTheme(user?.organization_id));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isThemeReady, setIsThemeReady] = useState<boolean>(true);

  // User personal preferences stored locally (default: light)
  const [userPreferences, setUserPreferencesState] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem("desire_user_prefs");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return { color_mode: "light", ui_density: "comfortable" };
  });

  // Calculate dirty state
  const isDirty = JSON.stringify(theme) !== JSON.stringify(draftTheme);

  // Load theme from API in background when user session changes
  useEffect(() => {
    let isMounted = true;

    async function loadOrgTheme() {
      if (!user) {
        const fallback = DEFAULT_ORG_THEME;
        setTheme(fallback);
        setDraftTheme(fallback);
        applyThemeToCss(fallback, userPreferences);
        if (isMounted) {
          setIsLoading(false);
          setIsThemeReady(true);
        }
        return;
      }

      // Instant local theme application
      const cached = getCachedTheme(user.organization_id);
      if (cached && cached.identity && cached.colors) {
        setTheme(cached);
        setDraftTheme(cached);
        applyThemeToCss(cached, userPreferences);
      }
      if (isMounted) {
        setIsThemeReady(true);
      }

      try {
        const data = await fetchApi<OrganizationThemeConfig>("/organization/theme");
        if (data && data.colors && isMounted) {
          setTheme(data);
          setDraftTheme(data);
          applyThemeToCss(data, userPreferences);
          try {
            const orgKey = user.organization_id ? `${THEME_CACHE_KEY_PREFIX}${user.organization_id}` : "desire_cached_org_theme";
            localStorage.setItem(orgKey, JSON.stringify(data));
            localStorage.setItem("desire_cached_org_theme", JSON.stringify(data));
          } catch (e) {}
        }
      } catch (err) {
        console.warn("Could not load organization theme from API, using cached/default:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsThemeReady(true);
        }
      }
    }

    loadOrgTheme();

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.organization_id]);

  // Apply draftTheme CSS tokens to document in real time
  useEffect(() => {
    applyThemeToCss(draftTheme, userPreferences);
  }, [draftTheme, userPreferences]);

  const updateDraftTheme = (updater: (prev: OrganizationThemeConfig) => OrganizationThemeConfig) => {
    setDraftTheme((prev) => updater(prev));
  };

  const saveTheme = async () => {
    try {
      const updated = await fetchApi<OrganizationThemeConfig>("/organization/theme", {
        method: "PUT",
        body: JSON.stringify({
          identity: draftTheme.identity,
          colors: draftTheme.colors,
          appearance: draftTheme.appearance,
          typography: draftTheme.typography,
        }),
      });
      setTheme(updated);
      setDraftTheme(updated);
      try {
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(updated));
      } catch (e) {}
    } catch (err: any) {
      console.error("Failed to save theme to server:", err);
      // Still persist locally
      setTheme(draftTheme);
      try {
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(draftTheme));
      } catch (e) {}
      throw err;
    }
  };

  const discardChanges = () => {
    setDraftTheme(theme);
  };

  const resetToDefault = async () => {
    try {
      const resetData = await fetchApi<OrganizationThemeConfig>("/organization/theme/reset", {
        method: "POST",
      });
      const res = resetData || DEFAULT_ORG_THEME;
      setTheme(res);
      setDraftTheme(res);
      try {
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(res));
      } catch (e) {}
    } catch (err) {
      console.warn("Reset API failed, using fallback:", err);
      setTheme(DEFAULT_ORG_THEME);
      setDraftTheme(DEFAULT_ORG_THEME);
      try {
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(DEFAULT_ORG_THEME));
      } catch (e) {}
    }
  };

  const setUserPreferences = (prefs: Partial<UserPreferences>) => {
    setUserPreferencesState((prev) => {
      const next = { ...prev, ...prefs };
      localStorage.setItem("desire_user_prefs", JSON.stringify(next));
      return next;
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        draftTheme,
        userPreferences,
        isDirty,
        isLoading,
        isThemeReady,
        setDraftTheme,
        updateDraftTheme,
        saveTheme,
        discardChanges,
        resetToDefault,
        setUserPreferences,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
