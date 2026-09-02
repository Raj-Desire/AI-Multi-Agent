import { OrganizationThemeConfig, ThemeColors, PalettePreset, UserPreferences } from "../types";

// ==========================================
// 1. Color Conversion & Math Utilities
// ==========================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function hexToRgb(hex: string): RGB {
  let cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) {
    return { r: 79, g: 70, b: 229 }; // Fallback indigo
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

export function hexToHsl(hex: string): HSL {
  return rgbToHsl(hexToRgb(hex));
}

export function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb(hsl));
}

// ==========================================
// 2. WCAG 2.1 Contrast Calculation
// ==========================================

export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const lumA = getLuminance(foregroundHex);
  const lumB = getLuminance(backgroundHex);
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

export interface ContrastResult {
  ratio: number;
  isAccessibleAA: boolean;
  isAccessibleAALarge: boolean;
  isAccessibleAAA: boolean;
  level: "good" | "warning" | "danger";
  message: string;
}

export function checkContrast(foregroundHex: string, backgroundHex: string): ContrastResult {
  const ratio = getContrastRatio(foregroundHex, backgroundHex);
  if (ratio >= 4.5) {
    return {
      ratio,
      isAccessibleAA: true,
      isAccessibleAALarge: true,
      isAccessibleAAA: ratio >= 7.0,
      level: "good",
      message: `Good contrast (${ratio}:1)`,
    };
  } else if (ratio >= 3.0) {
    return {
      ratio,
      isAccessibleAA: false,
      isAccessibleAALarge: true,
      isAccessibleAAA: false,
      level: "warning",
      message: `Acceptable for large text/icons only (${ratio}:1)`,
    };
  } else {
    return {
      ratio,
      isAccessibleAA: false,
      isAccessibleAALarge: false,
      isAccessibleAAA: false,
      level: "danger",
      message: `Low contrast (${ratio}:1) - hard to read`,
    };
  }
}

export function autoFixContrast(colorHex: string, backgroundHex: string): string {
  const bgLum = getLuminance(backgroundHex);
  const isLightBg = bgLum > 0.5;
  const hsl = hexToHsl(colorHex);

  let step = isLightBg ? -4 : 4;
  let currentHsl = { ...hsl };

  for (let i = 0; i < 20; i++) {
    const testHex = hslToHex(currentHsl);
    if (getContrastRatio(testHex, backgroundHex) >= 4.5) {
      return testHex;
    }
    currentHsl.l = Math.max(5, Math.min(95, currentHsl.l + step));
  }

  return isLightBg ? "#0f172a" : "#ffffff";
}

// ==========================================
// 3. Smart Theme Generator & Palettes
// ==========================================

export function generateSmartTheme(primaryHex: string, isDarkMode = false): ThemeColors {
  const primaryHsl = hexToHsl(primaryHex);

  const secondaryHsl: HSL = {
    h: (primaryHsl.h + 25) % 360,
    s: Math.max(70, Math.min(95, primaryHsl.s)),
    l: isDarkMode ? Math.min(75, primaryHsl.l + 10) : Math.max(25, primaryHsl.l - 10),
  };

  const accentHsl: HSL = {
    h: (primaryHsl.h + 175) % 360,
    s: Math.max(60, Math.min(90, primaryHsl.s)),
    l: isDarkMode ? 65 : 45,
  };

  const primaryHoverHsl: HSL = {
    ...primaryHsl,
    l: isDarkMode ? Math.min(85, primaryHsl.l + 8) : Math.max(20, primaryHsl.l - 8),
  };

  if (isDarkMode) {
    return {
      primary: primaryHex,
      primary_hover: hslToHex(primaryHoverHsl),
      secondary: hslToHex(secondaryHsl),
      accent: hslToHex(accentHsl),
      background: "#090d16",
      surface: "#111827",
      sidebar: "#0d131f",
      sidebar_text: "#f1f5f9",
      heading: "#ffffff",
      text: "#f8fafc",
      text_muted: "#94a3b8",
      border: "#1e293b",
      success: "#10b981",
      warning: "#f59e0b",
      danger: "#f43f5e",
      info: "#38bdf8",
    };
  }

  return {
    primary: primaryHex,
    primary_hover: hslToHex(primaryHoverHsl),
    secondary: hslToHex(secondaryHsl),
    accent: hslToHex(accentHsl),
    background: "#fafafa",
    surface: "#ffffff",
    sidebar: "#f8f9fa",
    sidebar_text: "#0f172a",
    heading: "#0f172a",
    text: "#1e293b",
    text_muted: "#475569",
    border: "#e2e8f0",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#3b82f6",
  };
}

export function getPalettePreset(preset: PalettePreset, currentPrimary = "#4f46e5"): ThemeColors {
  switch (preset) {
    case "Original": // Default Indigo
      return {
        primary: "#4f46e5",
        primary_hover: "#4338ca",
        secondary: "#0ea5e9",
        accent: "#8b5cf6",
        background: "#fafafa",
        surface: "#ffffff",
        sidebar: "#f8f9fa",
        sidebar_text: "#0f172a",
        heading: "#0f172a",
        text: "#1e293b",
        text_muted: "#475569",
        border: "#e2e8f0",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    case "Dark": // Midnight Dark
      return {
        primary: "#6366f1",
        primary_hover: "#818cf8",
        secondary: "#38bdf8",
        accent: "#a855f7",
        background: "#090d16",
        surface: "#111827",
        sidebar: "#0d131f",
        sidebar_text: "#f3f4f6",
        heading: "#ffffff",
        text: "#f9fafb",
        text_muted: "#9ca3af",
        border: "#1f2937",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#f43f5e",
        info: "#0284c7",
      };

    case "Muted": // Neutral Slate
      return {
        primary: "#475569",
        primary_hover: "#334155",
        secondary: "#64748b",
        accent: "#94a3b8",
        background: "#f8fafc",
        surface: "#ffffff",
        sidebar: "#f1f5f9",
        sidebar_text: "#0f172a",
        heading: "#0f172a",
        text: "#334155",
        text_muted: "#64748b",
        border: "#e2e8f0",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    case "Vivid": // Vivid Coral
      return {
        primary: "#f43f5e",
        primary_hover: "#e11d48",
        secondary: "#fb7185",
        accent: "#fb923c",
        background: "#fff5f5",
        surface: "#ffffff",
        sidebar: "#fff1f2",
        sidebar_text: "#1e293b",
        heading: "#0f172a",
        text: "#1e293b",
        text_muted: "#475569",
        border: "#ffe4e6",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    case "Complement": // Teal Complement
      return {
        primary: "#0d9488",
        primary_hover: "#0f766e",
        secondary: "#14b8a6",
        accent: "#06b6d4",
        background: "#f0fdfa",
        surface: "#ffffff",
        sidebar: "#f0fdf4",
        sidebar_text: "#042f2e",
        heading: "#042f2e",
        text: "#134e4a",
        text_muted: "#5eead4",
        border: "#ccfbf1",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    case "Triadic": // Triadic Harmony
      return {
        primary: "#6366f1",
        primary_hover: "#4f46e5",
        secondary: "#ec4899",
        accent: "#eab308",
        background: "#fafafa",
        surface: "#ffffff",
        sidebar: "#faf9fb",
        sidebar_text: "#0f172a",
        heading: "#0f172a",
        text: "#1e293b",
        text_muted: "#475569",
        border: "#e2e8f0",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    case "Analogous": // Analogous Sky
      return {
        primary: "#0284c7",
        primary_hover: "#0369a1",
        secondary: "#38bdf8",
        accent: "#6366f1",
        background: "#f0f9ff",
        surface: "#ffffff",
        sidebar: "#e0f2fe",
        sidebar_text: "#082f49",
        heading: "#082f49",
        text: "#0c4a6e",
        text_muted: "#38bdf8",
        border: "#bae6fd",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    case "Mono": // Monochrome
    case "Monochrome":
      return {
        primary: "#18181b",
        primary_hover: "#27272a",
        secondary: "#3f3f46",
        accent: "#71717a",
        background: "#fafafa",
        surface: "#ffffff",
        sidebar: "#f4f4f5",
        sidebar_text: "#09090b",
        heading: "#09090b",
        text: "#27272a",
        text_muted: "#71717a",
        border: "#e4e4e7",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    case "Pastel": // Soft Pastel
      return {
        primary: "#818cf8",
        primary_hover: "#6366f1",
        secondary: "#f472b6",
        accent: "#38bdf8",
        background: "#fbfaff",
        surface: "#ffffff",
        sidebar: "#f5f3ff",
        sidebar_text: "#1e1b4b",
        heading: "#1e1b4b",
        text: "#334155",
        text_muted: "#64748b",
        border: "#e0e7ff",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#f87171",
        info: "#60a5fa",
      };

    case "Deep": // Deep Navy
      return {
        primary: "#1e3a8a",
        primary_hover: "#172554",
        secondary: "#2563eb",
        accent: "#3b82f6",
        background: "#0f172a",
        surface: "#1e293b",
        sidebar: "#0b1120",
        sidebar_text: "#f8fafc",
        heading: "#f8fafc",
        text: "#e2e8f0",
        text_muted: "#94a3b8",
        border: "#334155",
        success: "#059669",
        warning: "#d97706",
        danger: "#dc2626",
        info: "#3b82f6",
      };

    case "Spectrum": // Dynamic Spectrum
      return {
        primary: "#e8568a",
        primary_hover: "#d01249",
        secondary: "#8b5cf6",
        accent: "#f59e0b",
        background: "#fafafa",
        surface: "#ffffff",
        sidebar: "#fbf9fb",
        sidebar_text: "#18181b",
        heading: "#18181b",
        text: "#27272a",
        text_muted: "#52525b",
        border: "#e4e4e7",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      };

    default:
      return generateSmartTheme(currentPrimary);
  }
}

export function shuffleColors(currentBase = "#4f46e5"): ThemeColors {
  const randomHue = Math.floor(Math.random() * 360);
  const randomPrimary = hslToHex({ h: randomHue, s: 78, l: 52 });
  return generateSmartTheme(randomPrimary);
}

// ==========================================
// 4. CSS Variable Injection Engine
// ==========================================

export function applyThemeToCss(
  theme: OrganizationThemeConfig,
  userPrefs?: UserPreferences
) {
  const root = document.documentElement;
  const colors = theme.colors;
  const appearance = theme.appearance;
  const typography = theme.typography;

  const effectiveMode =
    userPrefs?.color_mode === "dark"
      ? "dark"
      : appearance.color_mode === "dark"
      ? "dark"
      : "light";

  const isDark = effectiveMode === "dark";
  const effectiveDensity = userPrefs?.ui_density || appearance.ui_density || "comfortable";

  const primaryRgb = hexToRgb(colors.primary);
  const secondaryRgb = hexToRgb(colors.secondary);
  const accentRgb = hexToRgb(colors.accent);

  root.style.setProperty("--color-primary", colors.primary);
  root.style.setProperty("--color-primary-rgb", `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
  root.style.setProperty("--color-primary-light", `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.12)`);
  root.style.setProperty("--color-primary-subtle", `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.05)`);
  root.style.setProperty("--color-primary-ring", `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.25)`);
  root.style.setProperty("--color-primary-hover", colors.primary_hover || autoFixContrast(colors.primary, isDark ? "#000000" : "#ffffff"));
  
  root.style.setProperty("--color-secondary", colors.secondary);
  root.style.setProperty("--color-secondary-rgb", `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);
  root.style.setProperty("--color-secondary-light", `rgba(${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}, 0.12)`);

  root.style.setProperty("--color-accent", colors.accent);
  root.style.setProperty("--color-accent-rgb", `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
  root.style.setProperty("--color-accent-light", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.12)`);

  // Evaluate surface luminance to ensure proper text/border contrast
  const surfaceLum = getLuminance(colors.surface || (isDark ? "#111827" : "#ffffff"));
  const isSurfaceDark = surfaceLum < 0.45;

  const bgLum = getLuminance(colors.background || (isDark ? "#090d16" : "#fafafa"));
  const isBgDark = bgLum < 0.45;

  const sidebarLum = getLuminance(colors.sidebar || (isDark ? "#0d131f" : "#f8f9fa"));
  const isSidebarDark = sidebarLum < 0.45;

  // Background & Surface Tokens
  const effectiveBg = colors.background || (isDark ? "#090d16" : "#fafafa");
  const effectiveSurface = colors.surface || (isDark ? "#111827" : "#ffffff");
  const effectiveSidebar = colors.sidebar || (isDark ? "#0d131f" : "#f8f9fa");

  // Dynamic Text Colors based on surface luminance
  const effectiveHeading = colors.heading || (isSurfaceDark ? "#f8fafc" : "#0f172a");
  const effectiveText = colors.text || (isSurfaceDark ? "#e2e8f0" : "#1e293b");
  const effectiveMuted = colors.text_muted || (isSurfaceDark ? "#94a3b8" : "#64748b");
  const effectiveBorder = colors.border || (isSurfaceDark ? "#1f2937" : "#e5e7eb");
  const effectiveBorderStrong = isSurfaceDark ? "#374151" : "#d1d5db";
  const effectiveSurfaceMuted = isSurfaceDark ? "#182234" : "#f4f5f7";
  const effectiveSurfaceElevated = isSurfaceDark ? "#1e293b" : "#ffffff";
  const effectiveSidebarText = colors.sidebar_text || (isSidebarDark ? "#f3f4f6" : "#0f172a");

  root.style.setProperty("--color-background", effectiveBg);
  root.style.setProperty("--color-surface", effectiveSurface);
  root.style.setProperty("--color-surface-muted", effectiveSurfaceMuted);
  root.style.setProperty("--color-surface-elevated", effectiveSurfaceElevated);
  root.style.setProperty("--color-sidebar", effectiveSidebar);
  root.style.setProperty("--color-sidebar-text", effectiveSidebarText);
  root.style.setProperty("--color-heading", effectiveHeading);
  root.style.setProperty("--color-text", effectiveText);
  root.style.setProperty("--color-muted", effectiveMuted);
  root.style.setProperty("--color-border", effectiveBorder);
  root.style.setProperty("--color-border-strong", effectiveBorderStrong);

  root.style.setProperty("--color-success", colors.success || "#10b981");
  root.style.setProperty("--color-warning", colors.warning || "#f59e0b");
  root.style.setProperty("--color-danger", colors.danger || "#ef4444");
  root.style.setProperty("--color-info", colors.info || "#3b82f6");

  const radiusMap: Record<string, string> = {
    none: "0px",
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  };
  root.style.setProperty("--radius-main", radiusMap[appearance.border_radius] || "0.5rem");

  root.style.setProperty(
    "--font-family-base",
    `'${typography.font_family || "Inter"}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  );

  const densityMap: Record<string, { padding: string; gap: string; textScale: string }> = {
    compact: { padding: "0.5rem 0.75rem", gap: "0.5rem", textScale: "0.875rem" },
    comfortable: { padding: "0.75rem 1rem", gap: "0.75rem", textScale: "1rem" },
    spacious: { padding: "1rem 1.25rem", gap: "1rem", textScale: "1.0625rem" },
  };
  const d = densityMap[effectiveDensity] || densityMap.comfortable;
  root.style.setProperty("--density-padding", d.padding);
  root.style.setProperty("--density-gap", d.gap);

  root.setAttribute("data-ui-style", appearance.ui_style || "default");
  root.setAttribute("data-theme-mode", effectiveMode);
  root.setAttribute("data-density", effectiveDensity);

  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  if (theme.identity.org_name) {
    document.title = `${theme.identity.org_name} - AI Voice Platform`;
  }
}

export function getThemeCssVariables(
  theme: OrganizationThemeConfig,
  userPrefs?: UserPreferences
): Record<string, string> {
  const colors = theme.colors;
  const appearance = theme.appearance;
  const typography = theme.typography;

  const effectiveMode =
    userPrefs?.color_mode === "dark"
      ? "dark"
      : appearance.color_mode === "dark"
      ? "dark"
      : "light";

  const isDark = effectiveMode === "dark";
  const effectiveDensity = userPrefs?.ui_density || appearance.ui_density || "comfortable";

  const primaryRgb = hexToRgb(colors.primary);
  const secondaryRgb = hexToRgb(colors.secondary);
  const accentRgb = hexToRgb(colors.accent);

  const surfaceLum = getLuminance(colors.surface || (isDark ? "#111827" : "#ffffff"));
  const isSurfaceDark = surfaceLum < 0.45;

  const bgLum = getLuminance(colors.background || (isDark ? "#090d16" : "#fafafa"));

  const sidebarLum = getLuminance(colors.sidebar || (isDark ? "#0d131f" : "#f8f9fa"));
  const isSidebarDark = sidebarLum < 0.45;

  const effectiveBg = colors.background || (isDark ? "#090d16" : "#fafafa");
  const effectiveSurface = colors.surface || (isDark ? "#111827" : "#ffffff");
  const effectiveSidebar = colors.sidebar || (isDark ? "#0d131f" : "#f8f9fa");

  const effectiveHeading = colors.heading || (isSurfaceDark ? "#f8fafc" : "#0f172a");
  const effectiveText = colors.text || (isSurfaceDark ? "#e2e8f0" : "#1e293b");
  const effectiveMuted = colors.text_muted || (isSurfaceDark ? "#94a3b8" : "#64748b");
  const effectiveBorder = colors.border || (isSurfaceDark ? "#1f2937" : "#e5e7eb");
  const effectiveBorderStrong = isSurfaceDark ? "#374151" : "#d1d5db";
  const effectiveSurfaceMuted = isSurfaceDark ? "#182234" : "#f4f5f7";
  const effectiveSurfaceElevated = isSurfaceDark ? "#1e293b" : "#ffffff";
  const effectiveSidebarText = colors.sidebar_text || (isSidebarDark ? "#f3f4f6" : "#0f172a");

  const radiusMap: Record<string, string> = {
    none: "0px",
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  };

  const densityMap: Record<string, { padding: string; gap: string; textScale: string }> = {
    compact: { padding: "0.5rem 0.75rem", gap: "0.5rem", textScale: "0.875rem" },
    comfortable: { padding: "0.75rem 1rem", gap: "0.75rem", textScale: "1rem" },
    spacious: { padding: "1rem 1.25rem", gap: "1rem", textScale: "1.0625rem" },
  };
  const d = densityMap[effectiveDensity] || densityMap.comfortable;

  return {
    "--color-primary": colors.primary,
    "--color-primary-rgb": `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`,
    "--color-primary-light": `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.12)`,
    "--color-primary-subtle": `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.05)`,
    "--color-primary-ring": `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.25)`,
    "--color-primary-hover": colors.primary_hover || autoFixContrast(colors.primary, isDark ? "#000000" : "#ffffff"),
    "--color-secondary": colors.secondary,
    "--color-secondary-rgb": `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`,
    "--color-secondary-light": `rgba(${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}, 0.12)`,
    "--color-accent": colors.accent,
    "--color-accent-rgb": `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`,
    "--color-accent-light": `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.12)`,
    "--color-background": effectiveBg,
    "--color-surface": effectiveSurface,
    "--color-surface-muted": effectiveSurfaceMuted,
    "--color-surface-elevated": effectiveSurfaceElevated,
    "--color-sidebar": effectiveSidebar,
    "--color-sidebar-text": effectiveSidebarText,
    "--color-heading": effectiveHeading,
    "--color-text": effectiveText,
    "--color-muted": effectiveMuted,
    "--color-border": effectiveBorder,
    "--color-border-strong": effectiveBorderStrong,
    "--color-success": colors.success || "#10b981",
    "--color-warning": colors.warning || "#f59e0b",
    "--color-danger": colors.danger || "#ef4444",
    "--color-info": colors.info || "#3b82f6",
    "--radius-main": radiusMap[appearance.border_radius] || "0.5rem",
    "--font-family-base": `'${typography.font_family || "Inter"}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    "--density-padding": d.padding,
    "--density-gap": d.gap,
    fontFamily: `'${typography.font_family || "Inter"}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
  };
}
