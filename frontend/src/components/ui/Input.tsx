import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InfoTooltip } from "./Tooltip";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  tooltip?: string;
  error?: string | null;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, tooltip, error, helperText, leftIcon, rightIcon, className = "", id, type, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
    // Every password field gets a show/hide button unless the caller supplied its own right-hand icon.
    const [revealed, setRevealed] = useState(false);
    const isPassword = type === "password";
    const hasToggle = isPassword && !rightIcon;
    const hasRight = !!rightIcon || hasToggle;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={inputId}
              className="block text-xs font-medium text-[var(--color-heading)]"
            >
              {label}
            </label>
            {tooltip && <InfoTooltip content={tooltip} position="top" />}
          </div>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            // z-10 keeps the icon above the field even in themes whose inputs use blur/stacking effects.
            <div className="absolute left-3 z-10 text-[var(--color-muted)] pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            type={isPassword && revealed ? "text" : type}
            className={`ui-input w-full h-9 text-sm px-3 py-2 transition-all text-[var(--color-heading)] bg-[var(--color-surface)] placeholder-[var(--color-muted)]/70 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed border rounded-[var(--radius-main,0.375rem)] ${
              leftIcon ? "pl-9" : ""
            } ${hasRight ? "pr-9" : ""} ${
              error
                ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-2 focus:ring-[var(--color-danger)]/15"
                : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-ring)]"
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 z-10 text-[var(--color-muted)] flex items-center justify-center">
              {rightIcon}
            </div>
          )}
          {hasToggle && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? "Hide password" : "Show password"}
              title={revealed ? "Hide password" : "Show password"}
              tabIndex={-1}
              className="absolute right-2.5 z-10 p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer flex items-center justify-center"
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
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

Input.displayName = "Input";
