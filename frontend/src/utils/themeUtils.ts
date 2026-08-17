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
    h: (primaryHsl.h + 8) % 360,
    s: Math.max(70, Math.min(95, primaryHsl.s + 5)),
    l: isDarkMode ? Math.min(75, primaryHsl.l + 10) : Math.max(25, primaryHsl.l - 12),
  };

  const accentHsl: HSL = {
    h: (primaryHsl.h + 175) % 360,
    s: Math.max(55, Math.min(90, primaryHsl.s)),
    l: isDarkMode ? 65 : 42,
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
  };
}

export function getPalettePreset(preset: PalettePreset, basePrimary = "#e8568a"): ThemeColors {
  const baseHsl = hexToHsl(basePrimary);

  switch (preset) {
    case "Original":
      return {
        primary: basePrimary,
        primary_hover: hslToHex({ ...baseHsl, l: Math.max(20, baseHsl.l - 8) }),
        secondary: hslToHex({ h: (baseHsl.h + 5) % 360, s: Math.min(95, baseHsl.s + 10), l: Math.max(25, baseHsl.l - 12) }),
        accent: hslToHex({ h: (baseHsl.h + 175) % 360, s: 65, l: 42 }),
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
      };

    case "Dark":
      return {
        primary: basePrimary,
        primary_hover: hslToHex({ ...baseHsl, l: Math.min(80, baseHsl.l + 10) }),
        secondary: hslToHex({ h: (baseHsl.h + 20) % 360, s: 75, l: 55 }),
        accent: hslToHex({ h: (baseHsl.h + 180) % 360, s: 75, l: 60 }),
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

    case "Vivid": {
      const p = hslToHex({ h: baseHsl.h, s: 98, l: 50 });
      return {
        primary: p,
        primary_hover: hslToHex({ h: baseHsl.h, s: 98, l: 40 }),
        secondary: hslToHex({ h: (baseHsl.h + 25) % 360, s: 95, l: 45 }),
        accent: hslToHex({ h: (baseHsl.h + 170) % 360, s: 95, l: 48 }),
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#fbf6f8",
        sidebar_text: "#090d16",
        heading: "#090d16",
        text: "#1e293b",
        text_muted: "#4b5563",
        border: "#e5e7eb",
        success: "#059669",
        warning: "#d97706",
        danger: "#dc2626",
        info: "#2563eb",
      };
    }

    case "Muted": {
      const p = hslToHex({ h: baseHsl.h, s: 45, l: 52 });
      return {
        primary: p,
        primary_hover: hslToHex({ h: baseHsl.h, s: 45, l: 42 }),
        secondary: hslToHex({ h: (baseHsl.h + 15) % 360, s: 40, l: 48 }),
        accent: hslToHex({ h: (baseHsl.h + 180) % 360, s: 35, l: 48 }),
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#f8f7f9",
        sidebar_text: "#1e293b",
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

    case "Complement": {
      const compH = (baseHsl.h + 180) % 360;
      return {
        primary: basePrimary,
        primary_hover: hslToHex({ ...baseHsl, l: Math.max(20, baseHsl.l - 8) }),
        secondary: hslToHex({ h: compH, s: 80, l: 46 }),
        accent: hslToHex({ h: (compH + 40) % 360, s: 85, l: 52 }),
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#fbfafc",
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

    case "Triadic": {
      const t1 = (baseHsl.h + 120) % 360;
      const t2 = (baseHsl.h + 240) % 360;
      return {
        primary: basePrimary,
        primary_hover: hslToHex({ ...baseHsl, l: Math.max(20, baseHsl.l - 8) }),
        secondary: hslToHex({ h: t1, s: 75, l: 48 }),
        accent: hslToHex({ h: t2, s: 75, l: 52 }),
        background: "#ffffff",
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
    }

    case "Analogous": {
      const a1 = (baseHsl.h + 25) % 360;
      const a2 = (baseHsl.h + 50) % 360;
      return {
        primary: basePrimary,
        primary_hover: hslToHex({ ...baseHsl, l: Math.max(20, baseHsl.l - 8) }),
        secondary: hslToHex({ h: a1, s: 75, l: 48 }),
        accent: hslToHex({ h: a2, s: 80, l: 50 }),
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#fcf9fa",
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

    case "Mono": {
      return {
        primary: basePrimary,
        primary_hover: hslToHex({ ...baseHsl, l: Math.max(20, baseHsl.l - 8) }),
        secondary: hslToHex({ ...baseHsl, l: Math.max(20, baseHsl.l - 16) }),
        accent: hslToHex({ ...baseHsl, l: Math.min(85, baseHsl.l + 25) }),
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#fcf9fa",
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

    case "Pastel": {
      const p = hslToHex({ h: baseHsl.h, s: 65, l: 62 });
      return {
        primary: p,
        primary_hover: hslToHex({ h: baseHsl.h, s: 65, l: 50 }),
        secondary: hslToHex({ h: (baseHsl.h + 35) % 360, s: 65, l: 64 }),
        accent: hslToHex({ h: (baseHsl.h + 175) % 360, s: 65, l: 68 }),
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#fdfbfd",
        sidebar_text: "#1e293b",
        heading: "#0f172a",
        text: "#1e293b",
        text_muted: "#475569",
        border: "#e2e8f0",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#f87171",
        info: "#60a5fa",
      };
    }

    case "Deep": {
      const p = hslToHex({ h: baseHsl.h, s: 85, l: 30 });
      return {
        primary: p,
        primary_hover: hslToHex({ h: baseHsl.h, s: 85, l: 22 }),
        secondary: hslToHex({ h: (baseHsl.h + 20) % 360, s: 80, l: 35 }),
        accent: hslToHex({ h: (baseHsl.h + 180) % 360, s: 80, l: 38 }),
        background: "#ffffff",
        surface: "#ffffff",
        sidebar: "#18111e",
        sidebar_text: "#f8fafc",
        heading: "#0f172a",
        text: "#1e293b",
        text_muted: "#475569",
        border: "#cbd5e1",
        success: "#059669",
        warning: "#d97706",
        danger: "#dc2626",
        info: "#1d4ed8",
      };
    }

    case "Spectrum": {
      return {
        primary: "#e8568a",
        primary_hover: "#d01249",
        secondary: "#8b5cf6",
        accent: "#f59e0b",
        background: "#ffffff",
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
    }

    default:
      return generateSmartTheme(basePrimary);
  }
}

export function shuffleColors(currentBase: string): ThemeColors {
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
  root.style.setProperty("--color-primary-subtle", `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.06)`);
  root.style.setProperty("--color-primary-ring", `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.25)`);
  root.style.setProperty("--color-primary-hover", colors.primary_hover || autoFixContrast(colors.primary, isDark ? "#000000" : "#ffffff"));
  
  root.style.setProperty("--color-secondary", colors.secondary);
  root.style.setProperty("--color-secondary-rgb", `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);
  root.style.setProperty("--color-secondary-light", `rgba(${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}, 0.12)`);

  root.style.setProperty("--color-accent", colors.accent);
  root.style.setProperty("--color-accent-rgb", `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
  root.style.setProperty("--color-accent-light", `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.12)`);

  // Direct injection of heading, text, and muted tokens
  root.style.setProperty("--color-heading", colors.heading || colors.text || (isDark ? "#ffffff" : "#0f172a"));
  root.style.setProperty("--color-text", colors.text || (isDark ? "#f8fafc" : "#1e293b"));
  root.style.setProperty("--color-muted", colors.text_muted || (isDark ? "#94a3b8" : "#475569"));
  
  root.style.setProperty("--color-background", colors.background || (isDark ? "#090d16" : "#fafafa"));
  root.style.setProperty("--color-surface", colors.surface || (isDark ? "#111827" : "#ffffff"));
  root.style.setProperty("--color-surface-muted", isDark ? "#182234" : "#f4f5f7");
  root.style.setProperty("--color-surface-elevated", isDark ? "#1e293b" : "#ffffff");
  root.style.setProperty("--color-sidebar", colors.sidebar || (isDark ? "#0d131f" : "#f8f9fa"));
  root.style.setProperty("--color-sidebar-text", colors.sidebar_text || (isDark ? "#f3f4f6" : "#0f172a"));
  root.style.setProperty("--color-border", colors.border || (isDark ? "#1f2937" : "#e5e7eb"));
  root.style.setProperty("--color-border-strong", isDark ? "#374151" : "#d1d5db");

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
    `'${typography.font_family}', system-ui, -apple-system, sans-serif`
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
    document.title = `${theme.identity.org_name} - AI Agent Platform`;
  }
}
