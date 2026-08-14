import React, { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  UIStyle,
  BorderRadius,
  UIDensity,
  ColorMode,
  PalettePreset,
  ThemeColors,
} from "../types";
import {
  generateSmartTheme,
  getPalettePreset,
  shuffleColors,
} from "../utils/themeUtils";
import {
  Sparkles,
  Palette,
  Layers,
  Building2,
  Trash2,
  Upload,
  Check,
  RotateCcw,
  Shuffle,
  Save,
} from "lucide-react";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";

export const ThemeStudioView: React.FC = () => {
  const {
    draftTheme,
    updateDraftTheme,
    isDirty,
    saveTheme,
    discardChanges,
    resetToDefault,
  } = useTheme();

  const [paletteTab, setPaletteTab] = useState<"brand" | "default">("brand");
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

  // Remove Logo
  const handleRemoveLogo = () => {
    updateDraftTheme((prev) => ({
      ...prev,
      identity: {
        ...prev.identity,
        logo_url: null,
      },
    }));
  };

  // Preset Palettes
  const presets: { name: PalettePreset; label: string }[] = [
    { name: "Original", label: "Brand Original" },
    { name: "Dark", label: "Brand Dark" },
    { name: "Muted", label: "Brand Muted" },
    { name: "Vivid", label: "Brand Vivid" },
    { name: "Complement", label: "Brand Complement" },
    { name: "Triadic", label: "Brand Triadic" },
    { name: "Analogous", label: "Brand Analogous" },
    { name: "Mono", label: "Brand Mono" },
    { name: "Pastel", label: "Brand Pastel" },
    { name: "Deep", label: "Brand Deep" },
    { name: "Spectrum", label: "Brand Spectrum" },
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
    setStatusMessage({ text: "Generated fresh random harmonious palette!", type: "info" });
  };

  const handleResetColors = () => {
    const defaultThemeColors = getPalettePreset("Original", "#4f46e5");
    updateDraftTheme((prev) => ({
      ...prev,
      colors: defaultThemeColors,
      appearance: {
        ...prev.appearance,
        color_mode: "light",
        ui_style: "default",
      },
    }));
    setSelectedPreset("Original");
    setStatusMessage({ text: "Reset brand colors and style to professional default light theme.", type: "info" });
  };

  // Direct color update
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

  // Save handler
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setStatusMessage(null);
      await saveTheme();
      setStatusMessage({ text: "Organization theme successfully saved!", type: "success" });
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to save theme.", type: "danger" });
    } finally {
      setIsSaving(false);
    }
  };

  // 8 UI Styles Data
  const uiStyles: {
    id: UIStyle;
    title: string;
    desc: string;
    renderMockup: (primary: string, secondary: string) => React.ReactNode;
  }[] = [
    {
      id: "default",
      title: "Default",
      desc: "Clean, professional with subtle shadows",
      renderMockup: (p) => (
        <div className="w-full bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div style={{ backgroundColor: p }} className="w-14 h-2 rounded-full" />
          <button
            style={{ backgroundColor: p }}
            className="px-3.5 py-1.5 rounded-lg text-white font-bold text-[11px] shadow-xs"
          >
            Button
          </button>
        </div>
      ),
    },
    {
      id: "minimal",
      title: "Minimal",
      desc: "Ultra-clean flat design, sharp edges",
      renderMockup: (p) => (
        <div className="w-full bg-white border border-slate-200 rounded-none p-3.5 flex items-center justify-between">
          <div style={{ backgroundColor: p }} className="w-14 h-2 rounded-none" />
          <button
            style={{ backgroundColor: p }}
            className="px-3.5 py-1.5 rounded-none text-white font-bold text-[11px]"
          >
            Button
          </button>
        </div>
      ),
    },
    {
      id: "glassmorphism",
      title: "Glassmorphism",
      desc: "Frosted glass panels with blur",
      renderMockup: (p) => (
        <div
          style={{ backgroundColor: `${p}15`, borderColor: `${p}30` }}
          className="w-full backdrop-blur-md border rounded-xl p-3.5 shadow-md flex items-center justify-between"
        >
          <div style={{ backgroundColor: `${p}40` }} className="w-14 h-2 rounded-full" />
          <button
            style={{ backgroundColor: `${p}80` }}
            className="px-3.5 py-1.5 rounded-lg text-white font-bold text-[11px] shadow-sm backdrop-blur-xs border border-white/30"
          >
            Button
          </button>
        </div>
      ),
    },
    {
      id: "liquid_glass",
      title: "Liquid Glass",
      desc: "Fluid, dynamic glass with iridescent glow",
      renderMockup: (p, s) => (
        <div
          style={{
            background: `linear-gradient(135deg, ${p}25 0%, ${s}15 100%)`,
            borderColor: `${p}40`,
          }}
          className="w-full backdrop-blur-lg border rounded-2xl p-3.5 shadow-lg flex items-center justify-between"
        >
          <div
            style={{ background: `linear-gradient(90deg, ${p} 0%, ${s} 100%)` }}
            className="w-14 h-2 rounded-full"
          />
          <button
            style={{ background: `linear-gradient(135deg, ${p} 0%, ${s} 100%)` }}
            className="px-4 py-1.5 rounded-full text-white font-bold text-[11px] shadow-md"
          >
            Button
          </button>
        </div>
      ),
    },
    {
      id: "brutalism",
      title: "Brutalism",
      desc: "Bold, raw design with thick borders",
      renderMockup: (p) => (
        <div className="w-full bg-white border-2 border-black rounded-none p-3 shadow-[4px_4px_0px_#000] flex items-center justify-between">
          <div style={{ backgroundColor: p }} className="w-14 h-2 rounded-none border border-black" />
          <button className="px-3.5 py-1.5 bg-black text-white font-black text-[11px] rounded-none uppercase shadow-[2px_2px_0px_#e8568a]">
            BUTTON
          </button>
        </div>
      ),
    },
    {
      id: "claymorphism",
      title: "Claymorphism",
      desc: "Soft 3D clay-like layered shadows",
      renderMockup: (p) => (
        <div
          style={{
            boxShadow: "6px 8px 16px rgba(0,0,0,0.06), inset 2px 2px 3px rgba(255,255,255,0.9)",
          }}
          className="w-full bg-white border-2 border-white rounded-2xl p-3.5 flex items-center justify-between"
        >
          <div style={{ backgroundColor: p }} className="w-14 h-2.5 rounded-full shadow-inner" />
          <button
            style={{
              backgroundColor: p,
              boxShadow: "3px 4px 10px rgba(0,0,0,0.15), inset 1px 1px 2px rgba(255,255,255,0.4)",
            }}
            className="px-4 py-1.5 rounded-xl text-white font-bold text-[11px]"
          >
            Button
          </button>
        </div>
      ),
    },
    {
      id: "neomorphism",
      title: "Neomorphism",
      desc: "Soft extruded/pressed UI shadows",
      renderMockup: (p) => (
        <div
          style={{
            boxShadow: "4px 4px 10px rgba(0,0,0,0.07), -4px -4px 10px rgba(255,255,255,0.9)",
          }}
          className="w-full bg-white rounded-xl p-3.5 flex items-center justify-between border border-slate-100"
        >
          <div style={{ backgroundColor: p }} className="w-14 h-2 rounded-full" />
          <button
            style={{
              boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.08), inset -2px -2px 4px rgba(255,255,255,0.9)",
            }}
            className="px-3.5 py-1.5 rounded-lg text-slate-700 bg-white font-semibold text-[11px]"
          >
            Button
          </button>
        </div>
      ),
    },
    {
      id: "retro",
      title: "Retro",
      desc: "Vintage pixel-inspired terminal aesthetic",
      renderMockup: (p) => (
        <div className="w-full bg-[#120b18] border border-[#e8568a] rounded-sm p-3 flex items-center justify-between font-mono">
          <span className="text-[10px] text-[#e8568a] font-bold">&gt; SYSTEM</span>
          <button
            style={{ backgroundColor: p }}
            className="px-2.5 py-1 text-[10px] font-bold text-white uppercase rounded-xs tracking-wider"
          >
            [RUN]
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full space-y-8 pb-20 font-sans">
      {/* Top Header & Save Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Theme Studio & Customization
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure organization identity, palette generator, and workspace visual style.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-pink-600 bg-pink-50 px-3 py-1.5 rounded-xl border border-pink-200 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-pink-500" />
              Unsaved changes
            </span>
          )}
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
            Save Changes
          </Button>
        </div>
      </div>

      {statusMessage && (
        <Alert
          type={statusMessage.type}
          onDismiss={() => setStatusMessage(null)}
        >
          {statusMessage.text}
        </Alert>
      )}

      {/* =========================================================================
          SECTION 1: ORGANIZATION IDENTITY (Matching Screenshot 1)
          ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6 shadow-xs">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <span style={{ color: draftTheme.colors.primary }}>
            <Building2 className="w-5 h-5" />
          </span>
          <h2 className="text-base font-bold text-slate-900">
            Organization Identity
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Organization Logo Upload (5 cols) */}
          <div className="lg:col-span-5 space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Organization Logo
            </label>

            <div className="relative border-2 border-dashed border-pink-200 bg-pink-50/30 rounded-2xl p-6 flex items-center justify-between hover:bg-pink-50/50 transition-all">
              {draftTheme.identity.logo_url ? (
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white p-2 border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
                    <img
                      src={draftTheme.identity.logo_url}
                      alt="Logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Logo uploaded
                    </div>
                    <label className="text-[11px] text-slate-400 hover:text-indigo-600 cursor-pointer block mt-0.5">
                      Click or drag to replace
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="w-full flex items-center gap-3 cursor-pointer py-2">
                  <div className="w-12 h-12 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Upload Logo
                    </div>
                    <div className="text-[11px] text-slate-400">PNG, SVG, or JPG (max 2MB)</div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </label>
              )}

              {draftTheme.identity.logo_url && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  title="Remove logo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Organization Name & Preview (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Organization Name
              </label>
              <input
                type="text"
                value={draftTheme.identity.org_name}
                onChange={(e) =>
                  updateDraftTheme((prev) => ({
                    ...prev,
                    identity: { ...prev.identity, org_name: e.target.value },
                  }))
                }
                placeholder="e.g. Raj PMP"
                className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20 shadow-2xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">Appears in the sidebar and browser title.</p>
            </div>

            {/* Sidebar Preview Box */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Sidebar Preview
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs inline-flex flex-col items-center justify-center min-w-[140px]">
                {draftTheme.identity.logo_url ? (
                  <img
                    src={draftTheme.identity.logo_url}
                    alt="Sidebar logo"
                    className="w-10 h-10 object-contain mb-2"
                  />
                ) : (
                  <div
                    style={{ backgroundColor: draftTheme.colors.primary }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-2 shadow-xs"
                  >
                    <Building2 className="w-5 h-5" />
                  </div>
                )}
                <div
                  style={{ color: draftTheme.colors.primary }}
                  className="font-bold text-xs tracking-tight"
                >
                  {draftTheme.identity.org_name || "Desire AI"}
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2.5 pt-2">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between shadow-2xs">
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Show navigation logo
                  </div>
                  <div className="text-[11px] text-slate-400">Display logo in the sidebar header</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateDraftTheme((p) => ({
                      ...p,
                      identity: {
                        ...p.identity,
                        show_nav_logo: p.identity.show_nav_logo !== false ? false : true,
                      },
                    }))
                  }
                  style={{
                    backgroundColor:
                      draftTheme.identity.show_nav_logo !== false
                        ? draftTheme.colors.primary
                        : "#cbd5e1",
                  }}
                  className="w-11 h-6 rounded-full transition-colors relative cursor-pointer"
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      draftTheme.identity.show_nav_logo !== false ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between shadow-2xs">
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Show navigation title
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Display organization name in the sidebar header
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateDraftTheme((p) => ({
                      ...p,
                      identity: {
                        ...p.identity,
                        show_nav_title: p.identity.show_nav_title !== false ? false : true,
                      },
                    }))
                  }
                  style={{
                    backgroundColor:
                      draftTheme.identity.show_nav_title !== false
                        ? draftTheme.colors.primary
                        : "#cbd5e1",
                  }}
                  className="w-11 h-6 rounded-full transition-colors relative cursor-pointer"
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      draftTheme.identity.show_nav_title !== false ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: BRAND THEME COLORS (Matching Screenshot 2)
          ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span style={{ color: draftTheme.colors.primary }}>
              <Palette className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Brand Theme Colors
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleShuffle}
              style={{ backgroundColor: draftTheme.colors.primary }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-bold shadow-xs hover:opacity-90 transition-all cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Shuffle
            </button>

            <button
              type="button"
              onClick={handleResetColors}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-white text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        {/* Tab Switcher: Default Palettes vs Brand Palettes */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPaletteTab("default");
              handleResetColors();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              paletteTab === "default"
                ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
            }`}
          >
            Default Professional Palette
          </button>
          <button
            type="button"
            onClick={() => setPaletteTab("brand")}
            style={{
              backgroundColor: paletteTab === "brand" ? `${draftTheme.colors.primary}15` : "#ffffff",
              borderColor: paletteTab === "brand" ? draftTheme.colors.primary : "#e2e8f0",
              color: paletteTab === "brand" ? draftTheme.colors.primary : "#64748b",
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Harmonious Brand Variations
          </button>
        </div>

        {/* Horizontal Palette Preset Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {presets.map(({ name, label }) => {
            const isSelected = selectedPreset === name;
            const pColors = getPalettePreset(name, draftTheme.colors.primary);
            return (
              <button
                key={name}
                type="button"
                onClick={() => handleApplyPreset(name)}
                style={{
                  borderColor: isSelected ? draftTheme.colors.primary : "#e2e8f0",
                  backgroundColor: isSelected ? `${draftTheme.colors.primary}10` : "#ffffff",
                  color: isSelected ? draftTheme.colors.primary : "#334155",
                }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs hover:border-slate-300 bg-white`}
              >
                {/* 3 mini color swatches */}
                <div className="flex h-3 w-8 rounded-sm overflow-hidden border border-black/10 shrink-0">
                  <div style={{ backgroundColor: pColors.primary }} className="flex-1" />
                  <div style={{ backgroundColor: pColors.secondary }} className="flex-1" />
                  <div style={{ backgroundColor: pColors.accent }} className="flex-1" />
                </div>
                <span>{label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 ml-0.5" />}
              </button>
            );
          })}
        </div>

        {/* 8 Color Configuration Cards (2 Columns x 4 Rows) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* 1. Primary Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Primary Brand Color
              </div>
              <div className="text-[11px] text-slate-400">
                Main brand color for buttons, highlights, and active tabs
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.primary}
                onChange={(e) => handleColorChange("primary", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.primary }}
                className="w-8 h-8 rounded-lg shrink-0 border border-black/10 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.primary}
                onChange={(e) => handleColorChange("primary", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>

          {/* 2. Secondary Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Secondary Color
              </div>
              <div className="text-[11px] text-slate-400">
                Secondary brand color for hovers, borders, and gradients
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.secondary}
                onChange={(e) => handleColorChange("secondary", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.secondary }}
                className="w-8 h-8 rounded-lg shrink-0 border border-black/10 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.secondary}
                onChange={(e) => handleColorChange("secondary", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>

          {/* 3. Accent Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Accent Color
              </div>
              <div className="text-[11px] text-slate-400">
                Highlight color for badges, chips, and notification callouts
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.accent}
                onChange={(e) => handleColorChange("accent", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.accent }}
                className="w-8 h-8 rounded-lg shrink-0 border border-black/10 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.accent}
                onChange={(e) => handleColorChange("accent", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>

          {/* 4. Heading Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Heading Text Color
              </div>
              <div className="text-[11px] text-slate-400">
                Main page titles, card headers, and bold stat metrics
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.heading || "#0f172a"}
                onChange={(e) => handleColorChange("heading", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.heading || "#0f172a" }}
                className="w-8 h-8 rounded-lg shrink-0 border border-black/10 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.heading || "#0f172a"}
                onChange={(e) => handleColorChange("heading", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>

          {/* 5. Body Text Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Body Text Color
              </div>
              <div className="text-[11px] text-slate-400">
                Primary body copy, input text, table cell values
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.text}
                onChange={(e) => handleColorChange("text", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.text }}
                className="w-8 h-8 rounded-lg shrink-0 border border-black/10 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.text}
                onChange={(e) => handleColorChange("text", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>

          {/* 6. Subtext / Label Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Subtext & Label Color
              </div>
              <div className="text-[11px] text-slate-400">
                Field labels, table headers, descriptions, timestamps
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.text_muted || "#475569"}
                onChange={(e) => handleColorChange("text_muted", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.text_muted || "#475569" }}
                className="w-8 h-8 rounded-lg shrink-0 border border-black/10 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.text_muted || "#475569"}
                onChange={(e) => handleColorChange("text_muted", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>

          {/* 7. Background Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Background Color
              </div>
              <div className="text-[11px] text-slate-400">Page workspace canvas background</div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.background}
                onChange={(e) => handleColorChange("background", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.background }}
                className="w-8 h-8 rounded-lg shrink-0 border border-slate-300 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.background}
                onChange={(e) => handleColorChange("background", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>

          {/* 8. Sidebar & Card Surface Color */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Sidebar & Surface Color
              </div>
              <div className="text-[11px] text-slate-400">Sidebar background and UI card surfaces</div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                value={draftTheme.colors.sidebar}
                onChange={(e) => handleColorChange("sidebar", e.target.value)}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0"
              />
              <div
                style={{ backgroundColor: draftTheme.colors.sidebar }}
                className="w-8 h-8 rounded-lg shrink-0 border border-slate-300 shadow-2xs"
              />
              <input
                type="text"
                value={draftTheme.colors.sidebar}
                onChange={(e) => handleColorChange("sidebar", e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 uppercase bg-white rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>
          </div>
        </div>

        {/* Live Preview Bar at Bottom of Colors */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Real-Time Typography & Component Preview
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3
                  style={{ color: draftTheme.colors.heading || "#0f172a" }}
                  className="text-base font-bold"
                >
                  Enterprise Voice Platform (Heading)
                </h3>
                <p
                  style={{ color: draftTheme.colors.text_muted || "#475569" }}
                  className="text-xs mt-0.5"
                >
                  Subtext & description hierarchy dynamically updating in real-time.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  style={{
                    backgroundColor: `${draftTheme.colors.primary}18`,
                    color: draftTheme.colors.primary,
                    borderColor: `${draftTheme.colors.primary}40`,
                  }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase border"
                >
                  Primary Badge
                </span>
                <span
                  style={{
                    backgroundColor: `${draftTheme.colors.accent}18`,
                    color: draftTheme.colors.accent,
                    borderColor: `${draftTheme.colors.accent}40`,
                  }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase border"
                >
                  Accent Badge
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                style={{ backgroundColor: draftTheme.colors.primary }}
                className="px-5 py-2 rounded-xl text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Primary Button
              </button>
              <button
                style={{ backgroundColor: draftTheme.colors.secondary }}
                className="px-5 py-2 rounded-xl text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Secondary Button
              </button>
              <button
                style={{ backgroundColor: draftTheme.colors.accent }}
                className="px-5 py-2 rounded-xl text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Accent Action
              </button>
              <div
                style={{
                  backgroundColor: draftTheme.colors.background,
                  color: draftTheme.colors.text,
                }}
                className="px-4 py-2 rounded-xl font-medium text-xs border border-slate-300"
              >
                Body Text Sample
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: UI STYLE (Matching Screenshot 3)
          ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6 shadow-xs">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <span style={{ color: draftTheme.colors.primary }}>
            <Layers className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">UI Style</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Visual design language applied across the entire workspace
            </p>
          </div>
        </div>

        {/* 8 Cards in a 4x2 grid */}
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
                style={{
                  borderColor: isSelected ? draftTheme.colors.primary : "#e2e8f0",
                }}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer bg-white hover:shadow-md relative space-y-3 ${
                  isSelected ? "ring-2 ring-pink-500/20" : ""
                }`}
              >
                {/* Active Checkmark Pill */}
                {isSelected && (
                  <div
                    style={{ backgroundColor: draftTheme.colors.primary }}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-white flex items-center justify-center shadow-xs"
                  >
                    <Check className="w-3 h-3" />
                  </div>
                )}

                {/* Simulated Visual Mockup */}
                <div className="h-16 flex items-center justify-center">
                  {style.renderMockup(draftTheme.colors.primary, draftTheme.colors.secondary)}
                </div>

                {/* Title & Description */}
                <div>
                  <div
                    style={{ color: isSelected ? draftTheme.colors.primary : undefined }}
                    className="text-xs font-bold text-slate-900"
                  >
                    {style.title}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {style.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
