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
      setStatusMessage({ text: "Theme tokens and settings saved successfully.", type: "success" });
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to save theme.", type: "danger" });
    } finally {
      setIsSaving(false);
    }
  };

  // 8 UI Architecture Styles
  const uiStyles: {
    id: UIStyle;
    title: string;
    desc: string;
  }[] = [
    { id: "default", title: "Modern SaaS", desc: "Clean, restrained borders with subtle shadows" },
    { id: "minimal", title: "Minimalist Flat", desc: "Ultra-clean flat surfaces and zero shadows" },
    { id: "glassmorphism", title: "Glassmorphism", desc: "Frosted translucent panels with subtle blur" },
    { id: "liquid_glass", title: "Liquid Glass", desc: "Fluid, high-blur glass with subtle gradient sheen" },
    { id: "brutalism", title: "Neo-Brutalism", desc: "Bold solid 2px borders with crisp offset shadow" },
    { id: "claymorphism", title: "Claymorphism", desc: "Soft 3D pillowed surfaces with gentle depth" },
    { id: "neomorphism", title: "Neomorphism", desc: "Soft extruded/pressed dual light and dark shadows" },
    { id: "retro", title: "Retro Terminal", desc: "Vintage 90s terminal borders and monospaced typography" },
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
        <div className="space-y-4">
          <div className="text-xs text-[var(--color-muted)]">
            Select an architectural rendering style for your workspace. All components adapt automatically.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                  className={`p-4 rounded-[var(--radius-main,0.375rem)] border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]/40 shadow-xs"
                      : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-xs font-semibold text-[var(--color-heading)]">{style.title}</h4>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-[10px]">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">{style.desc}</p>
                </div>
              );
            })}
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
          <FormSection
            title="Semantic Color Tokens"
            description="Customize individual brand and UI colors. Contrast ratios are computed automatically."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { key: "primary" as const, label: "Primary Brand Color", val: draftTheme.colors.primary },
                { key: "secondary" as const, label: "Secondary Accent", val: draftTheme.colors.secondary },
                { key: "accent" as const, label: "Tertiary Accent", val: draftTheme.colors.accent },
                { key: "background" as const, label: "App Canvas Background", val: draftTheme.colors.background },
                { key: "surface" as const, label: "Card & Table Surface", val: draftTheme.colors.surface },
                { key: "sidebar" as const, label: "Sidebar Background", val: draftTheme.colors.sidebar },
              ].map((c) => {
                const contrast = checkContrast(c.val, "#ffffff");
                return (
                  <div key={c.key} className="p-3 border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--color-heading)]">{c.label}</span>
                      <span
                        style={{ backgroundColor: c.val }}
                        className="w-5 h-5 rounded border border-black/10 shrink-0"
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
                    <div className="text-[10px] text-[var(--color-muted)]">
                      WCAG Contrast: <strong className="text-[var(--color-heading)]">{contrast.ratio}:1</strong>
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
                placeholder="e.g. Desire AI"
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
                  <option value="Outfit">Outfit (Contemporary)</option>
                  <option value="Roboto">Roboto (Enterprise Standard)</option>
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
                  <option value="md">Medium (6px - Recommended)</option>
                  <option value="lg">Large (10px)</option>
                  <option value="xl">Extra Large (16px)</option>
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
