import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgbToHex,
  hexToHsl,
  hslToHex,
  getContrastRatio,
  checkContrast,
  getPalettePreset,
  getThemeCssVariables,
} from "../../utils/themeUtils";
import { DEFAULT_ORG_THEME } from "../../context/ThemeContext";

describe("themeUtils test suite", () => {
  it("converts hex to rgb and back accurately", () => {
    const rgb = hexToRgb("#4f46e5");
    expect(rgb).toEqual({ r: 79, g: 70, b: 229 });
    const hex = rgbToHex(rgb);
    expect(hex.toLowerCase()).toBe("#4f46e5");
  });

  it("calculates contrast ratios and WCAG compliance", () => {
    const contrastOnWhite = checkContrast("#000000", "#ffffff");
    expect(contrastOnWhite.ratio).toBeGreaterThan(15);
    expect(contrastOnWhite.isAccessibleAAA).toBe(true);

    const poorContrast = checkContrast("#ffffff", "#fefefe");
    expect(poorContrast.ratio).toBeLessThan(2);
    expect(poorContrast.level).toBe("danger");
  });

  it("generates theme presets with required keys", () => {
    const preset = getPalettePreset("Vivid", "#4f46e5");
    expect(preset.primary).toBeDefined();
    expect(preset.secondary).toBeDefined();
    expect(preset.accent).toBeDefined();
    expect(preset.surface).toBeDefined();
  });

  it("produces valid CSS variables matching theme tokens", () => {
    const vars = getThemeCssVariables(DEFAULT_ORG_THEME);
    expect(vars["--color-primary"]).toBe(DEFAULT_ORG_THEME.colors.primary);
    expect(vars["--color-surface"]).toBe(DEFAULT_ORG_THEME.colors.surface);
    expect(vars["--radius-main"]).toBe("0.5rem");
  });
});
