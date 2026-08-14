import React from "react";
import { checkContrast, autoFixContrast } from "../../utils/themeUtils";
import { Sparkles, Check, AlertTriangle, ShieldCheck } from "lucide-react";

export interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  backgroundHex?: string;
  helperText?: string;
  presetSwatches?: string[];
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value,
  onChange,
  backgroundHex,
  helperText,
  presetSwatches = [
    "#4f46e5",
    "#2563eb",
    "#0284c7",
    "#0d9488",
    "#16a34a",
    "#d97706",
    "#e11d48",
    "#9333ea",
    "#0f172a",
  ],
}) => {
  const contrast = backgroundHex ? checkContrast(value, backgroundHex) : null;

  const handleAutoFix = () => {
    if (backgroundHex) {
      const fixed = autoFixContrast(value, backgroundHex);
      onChange(fixed);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          {label}
        </label>
        {contrast && (
          <div className="flex items-center gap-1.5">
            {contrast.level === "good" ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-3 h-3" />
                {contrast.ratio}:1 AA Pass
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3 h-3" />
                  {contrast.ratio}:1 Low
                </span>
                <button
                  type="button"
                  onClick={handleAutoFix}
                  title="Auto-adjust lightness for WCAG AA contrast"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Fix
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Color input box */}
        <div className="relative flex items-center shrink-0">
          <input
            type="color"
            value={value.startsWith("#") && value.length === 7 ? value : "#4f46e5"}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 h-10 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer p-0.5 bg-white dark:bg-slate-800 shadow-xs"
          />
        </div>

        {/* Text HEX representation */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#4f46e5"
          className="flex-1 ui-input text-xs font-mono px-3 py-2 uppercase text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Swatches shortcuts */}
      {presetSwatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {presetSwatches.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              style={{ backgroundColor: hex }}
              className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                value.toLowerCase() === hex.toLowerCase()
                  ? "ring-2 ring-indigo-500 ring-offset-1 border-white"
                  : "border-black/10"
              }`}
            >
              {value.toLowerCase() === hex.toLowerCase() && (
                <Check className="w-3 h-3 text-white drop-shadow-xs" />
              )}
            </button>
          ))}
        </div>
      )}

      {helperText && <p className="text-[11px] text-slate-500 dark:text-slate-400">{helperText}</p>}
    </div>
  );
};
