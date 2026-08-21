import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "outline";
  size?: "sm" | "md";
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  dot = false,
  className = "",
  ...props
}) => {
  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[11px] gap-1",
    md: "px-2 py-0.5 text-xs gap-1.5",
  };

  const variantClasses = {
    default: "bg-[var(--color-surface-muted)] text-[var(--color-heading)] border-[var(--color-border)]",
    primary: "bg-[var(--color-primary-light)] text-[var(--color-primary)] border-[var(--color-primary-ring)]",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    neutral: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    outline: "bg-transparent text-[var(--color-text)] border-[var(--color-border)]",
  };

  const dotClasses = {
    default: "bg-slate-400",
    primary: "bg-[var(--color-primary)]",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-sky-500",
    neutral: "bg-slate-500",
    outline: "bg-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md border ${
        sizeClasses[size]
      } ${variantClasses[variant] || variantClasses.default} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses[variant] || dotClasses.default}`} />}
      {children}
    </span>
  );
};
