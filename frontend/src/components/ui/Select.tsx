import React from "react";
import { InfoTooltip } from "./Tooltip";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  tooltip?: string;
  error?: string | null;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, tooltip, error, helperText, options, children, className = "", id, ...props }, ref) => {
    const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={selectId}
              className="block text-xs font-medium text-[var(--color-heading)]"
            >
              {label}
            </label>
            {tooltip && <InfoTooltip content={tooltip} position="top" />}
          </div>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={`w-full h-9 text-sm px-3 py-2 transition-all text-[var(--color-heading)] bg-[var(--color-surface)] border rounded-[var(--radius-main,0.375rem)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer ${
              error
                ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-2 focus:ring-[var(--color-danger)]/15"
                : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-ring)]"
            } ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-[var(--color-surface)] text-[var(--color-heading)]">
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--color-muted)]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error ? (
          <p className="text-xs text-[var(--color-danger)] font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-[var(--color-muted)]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";
