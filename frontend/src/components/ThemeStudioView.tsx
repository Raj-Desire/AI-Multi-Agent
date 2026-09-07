import React, { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  UIStyle,
  BorderRadius,
  UIDensity,
  PalettePreset,
  ThemeColors,
} from "../types";
import {
  generateSmartTheme,
  getPalettePreset,
  shuffleColors,
  checkContrast,
  getThemeCssVariables,
} from "../utils/themeUtils";
import {
  Palette,
  Building2,
  Trash2,
  Upload,
  RotateCcw,
  Shuffle,
  Save,
  Check,
  Layout,
  Type,
  Eye,
} from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { Tabs } from "./ui/Tabs";
import { FormSection } from "./ui/FormSection";
import { ThemePreview } from "./ui/ThemePreview";

export const ThemeStudioView: React.FC = () => {
  const {
    draftTheme,
    updateDraftTheme,
    isDirty,
    saveTheme,
    discardChanges,
    resetToDefault,
  } = useTheme();

  const [activeTab, setActiveTab] = useState<string>("styles");
  const [selectedPreset, setSelectedPreset] = useState<PalettePreset>("Original");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "danger" | "info" | "warning";
  } | null>(null);

  // Logo file upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatusMessage({ text: "Logo image must be smaller than 2MB", type: "danger" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateDraftTheme((prev) => ({
        ...prev,
        identity: {
          ...prev.identity,
          logo_url: dataUrl,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    updateDraftTheme((prev) => ({
      ...prev,
      identity: {
        ...prev.identity,
        logo_url: null,
      },
    }));
  };

  const presets: { name: PalettePreset; label: string }[] = [
    { name: "Original", label: "Default Indigo" },
    { name: "Dark", label: "Midnight Dark" },
    { name: "Muted", label: "Neutral Slate" },
    { name: "Vivid", label: "Vivid Coral" },
    { name: "Complement", label: "Teal Complement" },
    { name: "Triadic", label: "Triadic Harmony" },
    { name: "Analogous", label: "Analogous Sky" },
    { name: "Mono", label: "Monochrome" },
    { name: "Pastel", label: "Soft Pastel" },
    { name: "Deep", label: "Deep Navy" },
    { name: "Spectrum", label: "Dynamic Spectrum" },
  ];

  const handleApplyPreset = (presetName: PalettePreset) => {
    setSelectedPreset(presetName);
    const newColors = getPalettePreset(presetName, draftTheme.colors.primary);
    updateDraftTheme((prev) => ({
      ...prev,
      colors: newColors,
    }));
  };

  const handleShuffle = () => {
    const shuffled = shuffleColors(draftTheme.colors.primary);
    updateDraftTheme((prev) => ({
      ...prev,
      colors: shuffled,
    }));
    setStatusMessage({ text: "Generated fresh harmonious palette.", type: "info" });
  };

  const handleColorChange = (key: keyof ThemeColors, hex: string) => {
    updateDraftTheme((prev) => {
      const updatedColors = { ...prev.colors, [key]: hex };
      if (key === "primary") {
        const smart = generateSmartTheme(hex, prev.appearance.color_mode === "dark");
        updatedColors.primary_hover = smart.primary_hover;
      }
      return {
        ...prev,
        colors: updatedColors,
      };
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setStatusMessage(null);
      await saveTheme();
      setStatusMessage({ text: "Theme saved and applied permanently across all application pages.", type: "success" });
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to save theme.", type: "danger" });
    } finally {
      setIsSaving(false);
    }
  };

  // 8 UI Architecture Styles with Visual Mockups
  const uiStyles: {
    id: UIStyle;
    title: string;
    desc: string;
    renderMockup: (primary: string, secondary: string) => React.ReactNode;
  }[] = [
    {
      id: "default",
      title: "Modern SaaS",
      desc: "Clean, restrained borders with subtle shadows",
      renderMockup: (p) => (
        <div className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2.5 shadow-xs flex items-center justify-between gap-2">
          <div style={{ backgroundColor: p }} className="w-12 h-2 rounded-full shrink-0" />
          <div style={{ backgroundColor: p }} className="px-2.5 py-1 rounded-md text-white font-medium text-[10px] shadow-2xs">
            Button
          </div>
        </div>
      ),
    },
    {
      id: "minimal",
      title: "Minimalist Flat",
      desc: "Ultra-clean flat surfaces and zero shadows",
      renderMockup: (p) => (
        <div className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-none p-2.5 shadow-none flex items-center justify-between gap-2">
          <div style={{ backgroundColor: p }} className="w-12 h-2 rounded-none shrink-0" />
          <div style={{ backgroundColor: p }} className="px-2.5 py-1 rounded-none text-white font-medium text-[10px]">
            Button
          </div>
        </div>
      ),
    },
    {
      id: "glassmorphism",
      title: "Glassmorphism",
      desc: "Frosted translucent panels with subtle blur",
      renderMockup: (p) => (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.75)",
            backdropFilter: "blur(12px)",
            borderColor: "rgba(255, 255, 255, 0.6)",
          }}
          className="w-full border rounded-xl p-2.5 shadow-sm flex items-center justify-between gap-2 bg-gradient-to-br from-white/80 to-white/40 dark:from-slate-800/80 dark:to-slate-900/40"
        >
          <div style={{ backgroundColor: p }} className="w-12 h-2 rounded-full opacity-80 shrink-0" />
          <div
            style={{ backgroundColor: p }}
            className="px-2.5 py-1 rounded-lg text-white font-medium text-[10px] shadow-xs backdrop-blur-xs border border-white/30"
          >
            Button
          </div>
        </div>
      ),
    },
    {
      id: "liquid_glass",
      title: "Liquid Glass",
      desc: "Fluid, high-blur glass with subtle gradient sheen",
      renderMockup: (p, s) => (
        <div
          style={{
            background: `linear-gradient(135deg, ${p}18 0%, ${s}12 100%)`,
            borderColor: `${p}35`,
          }}
          className="w-full backdrop-blur-md border rounded-2xl p-2.5 shadow-md flex items-center justify-between gap-2"
        >
          <div
            style={{ background: `linear-gradient(90deg, ${p} 0%, ${s} 100%)` }}
            className="w-12 h-2 rounded-full shrink-0"
          />
          <div
            style={{ background: `linear-gradient(135deg, ${p} 0%, ${s} 100%)` }}
            className="px-3 py-1 rounded-full text-white font-medium text-[10px] shadow-sm"
          >
            Button
          </div>
        </div>
      ),
    },
    {
      id: "brutalism",
      title: "Neo-Brutalism",
      desc: "Bold solid 2px borders with crisp offset shadow",
      renderMockup: (p) => (
        <div className="w-full bg-[var(--color-surface)] border-2 border-slate-900 dark:border-white rounded-none p-2 shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#f8fafc] flex items-center justify-between gap-2">
          <div style={{ backgroundColor: p }} className="w-12 h-2 rounded-none border border-slate-900 dark:border-white shrink-0" />
          <div
            style={{ backgroundColor: p }}
            className="px-2.5 py-1 bg-slate-900 text-white font-bold text-[10px] rounded-none border border-slate-900 shadow-[1px_1px_0px_#000]"
          >
            BUTTON
          </div>
        </div>
      ),
    },
    {
      id: "claymorphism",
      title: "Claymorphism",
      desc: "Soft 3D pillowed surfaces with gentle depth",
      renderMockup: (p) => (
        <div
          style={{
            boxShadow: "4px 6px 14px rgba(0,0,0,0.06), inset 2px 2px 3px rgba(255,255,255,0.9)",
          }}
          className="w-full bg-[var(--color-surface)] border-2 border-white/80 rounded-2xl p-2.5 flex items-center justify-between gap-2"
        >
          <div style={{ backgroundColor: p }} className="w-12 h-2.5 rounded-full shadow-inner shrink-0" />
          <div
            style={{
              backgroundColor: p,
              boxShadow: "2px 3px 8px rgba(0,0,0,0.15), inset 1px 1px 2px rgba(255,255,255,0.4)",
            }}
            className="px-3 py-1 rounded-xl text-white font-medium text-[10px]"
          >
            Button
          </div>
        </div>
      ),
    },
    {
      id: "neomorphism",
      title: "Neomorphism",
      desc: "Soft extruded/pressed dual light and dark shadows",
      renderMockup: (p) => (
        <div
          style={{
            boxShadow: "4px 4px 10px rgba(0,0,0,0.06), -4px -4px 10px rgba(255,255,255,0.9)",
          }}
          className="w-full bg-[var(--color-surface)] rounded-xl p-2.5 flex items-center justify-between gap-2 border border-slate-100 dark:border-slate-800"
        >
          <div style={{ backgroundColor: p }} className="w-12 h-2 rounded-full shrink-0" />
          <div
            style={{
              boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.1), inset -1px -1px 3px rgba(255,255,255,0.8)",
            }}
            className="px-2.5 py-1 rounded-lg text-[var(--color-heading)] bg-[var(--color-surface)] font-medium text-[10px] border border-slate-200/50"
          >
            Button
          </div>
        </div>
      ),
    },
    {
      id: "retro",
      title: "Retro Terminal",
      desc: "Vintage 90s terminal borders and monospaced typography",
      renderMockup: (p) => (
        <div className="w-full bg-[#101420] border-2 border-t-slate-200 border-l-slate-200 border-r-slate-700 border-b-slate-700 rounded-none p-2 flex items-center justify-between gap-2 font-mono">
          <span style={{ color: p }} className="text-[10px] font-bold">&gt; SYS</span>
          <div
            style={{ backgroundColor: p }}
            className="px-2 py-0.5 text-[9px] font-bold text-white uppercase rounded-xs border-t border-l border-white/50 border-r border-b border-black/50"
          >
            [RUN]
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Theme Studio"
        description="White-label branding, typography, color tokens, and 8 UI architecture styles."
        badge={
          isDirty ? (
            <span className="text-xs font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Unsaved changes
            </span>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={discardChanges}
              disabled={!isDirty || isSaving}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={!isDirty}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Save Theme
            </Button>
          </div>
        }
      />

      {statusMessage && (
        <Alert
          type={statusMessage.type}
          onDismiss={() => setStatusMessage(null)}
        >
          {statusMessage.text}
        </Alert>
      )}

      {isDirty && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-[var(--radius-main,0.375rem)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
            <span>
              <strong>Draft Preview Active:</strong> Changes are only visible in Theme Studio previews. Click <strong>"Save Theme"</strong> to apply permanently across all platform pages.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={discardChanges}
            className="text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
          >
            Reset Preview
          </Button>
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs
        tabs={[
          { id: "styles", label: "UI Architecture Styles", icon: <Layout className="w-3.5 h-3.5" /> },
          { id: "colors", label: "Colors & Palettes", icon: <Palette className="w-3.5 h-3.5" /> },
          { id: "identity", label: "Identity & Branding", icon: <Building2 className="w-3.5 h-3.5" /> },
          { id: "typography", label: "Typography & Radius", icon: <Type className="w-3.5 h-3.5" /> },
          { id: "preview", label: "Interactive Preview", icon: <Eye className="w-3.5 h-3.5" /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      {/* TAB 1: 8 UI ARCHITECTURE STYLES */}
      {activeTab === "styles" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-heading)]">UI Architecture Style Presets</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Select an architectural design language. Each style transforms cards, borders, buttons, and elevation across the entire platform.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {uiStyles.map((style) => {
              const isSelected = draftTheme.appearance.ui_style === style.id;
              return (
                <div
                  key={style.id}
                  onClick={() =>
                    updateDraftTheme((prev) => ({
                      ...prev,
                      appearance: { ...prev.appearance, ui_style: style.id },
                    }))
                  }
                  className={`p-3.5 rounded-[var(--radius-main,0.375rem)] border text-left cursor-pointer transition-all flex flex-col justify-between gap-3 group hover:border-[var(--color-primary)] ${
                    isSelected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]/30 ring-2 ring-[var(--color-primary-ring)] shadow-xs"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  {/* Visual Rendered Mockup Container */}
                  <div className="p-2.5 rounded-md bg-[var(--color-surface-muted)]/60 border border-[var(--color-border)] flex items-center justify-center min-h-[64px] transition-transform group-hover:scale-[1.02]">
                    {style.renderMockup(draftTheme.colors.primary, draftTheme.colors.secondary)}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`text-xs font-semibold ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-heading)]"}`}>
                        {style.title}
                      </h4>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-[10px]">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Live Style Demo Sandbox */}
          <div className="pt-2">
            <div
              style={getThemeCssVariables(draftTheme) as React.CSSProperties}
              data-ui-style={draftTheme.appearance.ui_style || "default"}
              className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs space-y-4 text-left"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--color-heading)]">
                    Active Style Live Sandbox ({uiStyles.find((s) => s.id === draftTheme.appearance.ui_style)?.title})
                  </h4>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    This sandbox directly consumes the resolved architecture style and design tokens in real time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="ui-badge px-2 py-0.5 text-xs font-medium bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary-ring)]">
                    Active: {draftTheme.appearance.ui_style}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* 1. Card */}
                <div className="ui-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--color-heading)]">Live UI Card</span>
                    <span className="ui-badge px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      Active
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Surface material, border thickness, corner radius, and elevation adjust according to design contract.
                  </p>
                </div>

                {/* 2. Controls (Input & Select) */}
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-heading)] block">Sample Field</label>
                    <input
                      type="text"
                      readOnly
                      value="Interactive input component"
                      className="w-full h-9 text-xs px-3 ui-input bg-[var(--color-surface)] text-[var(--color-heading)]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button type="button" className="ui-button-primary px-3.5 py-1.5 text-xs font-medium cursor-pointer">
                      Primary
                    </button>
                    <button type="button" className="ui-button-secondary px-3.5 py-1.5 text-xs font-medium cursor-pointer">
                      Secondary
                    </button>
                    <button type="button" className="ui-button-outline px-3.5 py-1.5 text-xs font-medium cursor-pointer">
                      Outline
                    </button>
                  </div>
                </div>

                {/* 3. Mini Table */}
                <div className="ui-table-container overflow-hidden">
                  <table className="ui-table w-full text-left text-xs">
                    <thead className="bg-[var(--color-surface-muted)]/50 border-b border-[var(--color-border)] text-[10px] text-[var(--color-muted)] font-semibold">
                      <tr>
                        <th className="px-3 py-1.5">Component</th>
                        <th className="px-3 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      <tr>
                        <td className="px-3 py-1.5 font-medium text-[var(--color-heading)]">Dialer Engine</td>
                        <td className="px-3 py-1.5 text-emerald-600 font-medium">Ready</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1.5 font-medium text-[var(--color-heading)]">Voice Assistant</td>
                        <td className="px-3 py-1.5 text-[var(--color-primary)] font-medium">Synced</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BRAND COLORS & PALETTES */}
      {activeTab === "colors" && (
        <div className="divide-y divide-[var(--color-border)]">
          {/* Preset Palettes */}
          <FormSection
            title="Palette Presets"
            description="Select a curated harmonious color scheme or shuffle for AI-generated themes."
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={handleShuffle}
                leftIcon={<Shuffle className="w-3.5 h-3.5" />}
              >
                Shuffle Harmony
              </Button>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {presets.map((preset) => {
                const isSelected = selectedPreset === preset.name;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyPreset(preset.name)}
                    className={`p-2.5 rounded-[var(--radius-main,0.375rem)] border text-left text-xs transition-all cursor-pointer ${
                      isSelected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] font-semibold text-[var(--color-primary)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-heading)]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </FormSection>

          {/* Color Tokens Editor */}
          {/* Color Tokens Editor */}
          <FormSection
            title="Semantic Color Tokens"
            description="Customize individual brand and UI colors. Contrast ratios are computed automatically against their actual render surface."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  key: "primary" as const,
                  label: "Primary Brand Color",
                  val: draftTheme.colors.primary,
                  pairLabel: "Button text (#fff) on Primary",
                  contrast: checkContrast("#ffffff", draftTheme.colors.primary),
                },
                {
                  key: "secondary" as const,
                  label: "Secondary Accent",
                  val: draftTheme.colors.secondary,
                  pairLabel: "Secondary on Surface",
                  contrast: checkContrast(draftTheme.colors.secondary, draftTheme.colors.surface || "#ffffff"),
                },
                {
                  key: "accent" as const,
                  label: "Tertiary Accent",
                  val: draftTheme.colors.accent,
                  pairLabel: "Accent on Surface",
                  contrast: checkContrast(draftTheme.colors.accent, draftTheme.colors.surface || "#ffffff"),
                },
                {
                  key: "background" as const,
                  label: "App Canvas Background",
                  val: draftTheme.colors.background,
                  pairLabel: "Text on Background Canvas",
                  contrast: checkContrast(draftTheme.colors.text || "#1e293b", draftTheme.colors.background || "#fafafa"),
                },
                {
                  key: "surface" as const,
                  label: "Card & Table Surface",
                  val: draftTheme.colors.surface,
                  pairLabel: "Heading on Card Surface",
                  contrast: checkContrast(draftTheme.colors.heading || "#0f172a", draftTheme.colors.surface || "#ffffff"),
                },
                {
                  key: "sidebar" as const,
                  label: "Sidebar Background",
                  val: draftTheme.colors.sidebar,
                  pairLabel: "Sidebar Text on Sidebar",
                  contrast: checkContrast(draftTheme.colors.sidebar_text || "#0f172a", draftTheme.colors.sidebar || "#f8f9fa"),
                },
              ].map((c) => {
                const ratioNum = c.contrast.ratio;
                const badgeStyle =
                  ratioNum >= 7.0
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : ratioNum >= 4.5
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : ratioNum >= 3.0
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    : "bg-rose-500/10 text-rose-600 border-rose-500/20";

                const badgeText =
                  ratioNum >= 7.0
                    ? "AAA"
                    : ratioNum >= 4.5
                    ? "AA"
                    : ratioNum >= 3.0
                    ? "AA Large"
                    : "Low Contrast";

                return (
                  <div key={c.key} className="p-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--color-heading)]">{c.label}</span>
                      <span
                        style={{ backgroundColor: c.val }}
                        className="w-5 h-5 rounded border border-black/10 shrink-0 shadow-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={c.val}
                        onChange={(e) => handleColorChange(c.key, e.target.value)}
                        className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={c.val}
                        onChange={(e) => handleColorChange(c.key, e.target.value)}
                        className="font-mono text-xs px-2 py-1 border border-[var(--color-border)] rounded w-full bg-[var(--color-surface)] text-[var(--color-heading)]"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]/60 text-[10px] text-[var(--color-muted)]">
                      <span className="truncate pr-1" title={c.pairLabel}>{c.pairLabel}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <strong className="text-[var(--color-heading)]">{c.contrast.ratio}:1</strong>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border ${badgeStyle}`}>
                          {badgeText}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </FormSection>
        </div>
      )}

      {/* TAB 3: IDENTITY & BRANDING */}
      {activeTab === "identity" && (
        <div className="divide-y divide-[var(--color-border)]">
          <FormSection
            title="Organization Brand"
            description="Customize the organization name and logo visible to workspace team members."
          >
            <div className="space-y-4">
              <Input
                label="Organization Display Name"
                value={draftTheme.identity.org_name}
                onChange={(e) =>
                  updateDraftTheme((prev) => ({
                    ...prev,
                    identity: { ...prev.identity, org_name: e.target.value },
                  }))
                }
                placeholder="e.g. Acme Corp"
              />

              {/* Logo Upload */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
                  Brand Logo
                </label>
                <div className="p-4 border border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] flex items-center justify-between bg-[var(--color-surface)]">
                  {draftTheme.identity.logo_url ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={draftTheme.identity.logo_url}
                        alt="Logo"
                        className="w-10 h-10 object-contain rounded border border-[var(--color-border)] p-1 bg-white"
                      />
                      <div>
                        <div className="text-xs font-medium text-[var(--color-heading)]">Logo active</div>
                        <label className="text-[11px] text-[var(--color-primary)] hover:underline cursor-pointer">
                          Replace file
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] cursor-pointer">
                      <Upload className="w-4 h-4 text-[var(--color-primary)]" />
                      <span>Upload PNG or SVG logo (max 2MB)</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  )}

                  {draftTheme.identity.logo_url && (
                    <Button variant="ghost" size="sm" onClick={handleRemoveLogo} className="text-[var(--color-danger)]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </FormSection>
        </div>
      )}

      {/* TAB 4: TYPOGRAPHY & RADIUS */}
      {activeTab === "typography" && (
        <div className="divide-y divide-[var(--color-border)]">
          <FormSection
            title="Typography & Sizing"
            description="Select the primary font family and corner radius applied across all surfaces."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
                  Primary Font Family
                </label>
                <select
                  value={draftTheme.typography.font_family}
                  onChange={(e) =>
                    updateDraftTheme((prev) => ({
                      ...prev,
                      typography: { ...prev.typography, font_family: e.target.value as any },
                    }))
                  }
                  className="w-full h-9 text-xs px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none"
                >
                  <option value="Inter">Inter (Modern Neutral)</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans (Clean Geometric)</option>
                  <option value="Outfit">Outfit (Contemporary Display)</option>
                  <option value="Roboto">Roboto (Enterprise Standard)</option>
                  <option value="Poppins">Poppins (Friendly Geometric)</option>
                  <option value="Space Grotesk">Space Grotesk (Tech Monospace Accent)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
                  Corner Border Radius
                </label>
                <select
                  value={draftTheme.appearance.border_radius}
                  onChange={(e) =>
                    updateDraftTheme((prev) => ({
                      ...prev,
                      appearance: { ...prev.appearance, border_radius: e.target.value as BorderRadius },
                    }))
                  }
                  className="w-full h-9 text-xs px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none"
                >
                  <option value="none">Square (0px)</option>
                  <option value="sm">Small (4px)</option>
                  <option value="md">Medium (8px - Recommended)</option>
                  <option value="lg">Large (12px)</option>
                  <option value="xl">Extra Large (16px)</option>
                  <option value="full">Pill / Full (9999px)</option>
                </select>
              </div>
            </div>
          </FormSection>
        </div>
      )}

      {/* TAB 5: INTERACTIVE PREVIEW */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <div className="text-xs text-[var(--color-muted)]">
            Live interactive sandbox testing the current draft theme tokens in real-time before saving.
          </div>
          <ThemePreview theme={draftTheme} />
        </div>
      )}
    </div>
  );
};
