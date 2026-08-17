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
    sm: "h-8 px-2.5 text-xs gap-1.5 font-medium rounded-[var(--radius-main,0.375rem)]",
    md: "h-9 px-3.5 text-sm gap-2 font-medium rounded-[var(--radius-main,0.375rem)]",
    lg: "h-10 px-4 text-sm gap-2.5 font-medium rounded-[var(--radius-main,0.375rem)]",
  };

  const variantClasses = {
    primary:
      "ui-button-primary text-white shadow-xs hover:opacity-95 active:scale-[0.99] border-transparent",
    secondary:
      "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] active:scale-[0.99]",
    outline:
      "bg-[var(--color-surface)] text-[var(--color-heading)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] hover:border-[var(--color-border-strong)] active:scale-[0.99] shadow-xs",
    ghost:
      "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)] active:scale-[0.99]",
    danger:
      "bg-[var(--color-danger)] hover:opacity-90 text-white active:scale-[0.99] shadow-xs border-transparent",
    success:
      "bg-[var(--color-success)] hover:opacity-90 text-white active:scale-[0.99] shadow-xs border-transparent",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--color-primary-ring)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none font-sans ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      ) : leftIcon ? (
        <span className="shrink-0 flex items-center">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!isLoading && rightIcon && (
        <span className="shrink-0 flex items-center">{rightIcon}</span>
      )}
    </button>
  );
};
