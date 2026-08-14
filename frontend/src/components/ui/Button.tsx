import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs gap-1.5 font-semibold rounded-lg",
    md: "px-4 py-2 text-sm gap-2 font-bold rounded-xl",
    lg: "px-5 py-3 text-base gap-2.5 font-bold rounded-xl",
  };

  const variantClasses = {
    primary: "ui-button-primary shadow-xs active:scale-[0.98] transition-all",
    secondary: "ui-button-secondary shadow-xs active:scale-[0.98] transition-all",
    outline:
      "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 active:scale-[0.98] transition-all shadow-2xs",
    ghost:
      "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] transition-all",
    danger:
      "bg-rose-600 hover:bg-rose-700 text-white shadow-xs active:scale-[0.98] transition-all",
    success:
      "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-[0.98] transition-all",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--color-primary-ring)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
