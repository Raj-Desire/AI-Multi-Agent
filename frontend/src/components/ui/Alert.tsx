import React from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export interface AlertProps {
  type?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = "info",
  title,
  children,
  onDismiss,
  className = "",
}) => {
  const styles = {
    info: {
      container: "bg-sky-500/10 border-sky-500/20 text-sky-900 dark:text-sky-200",
      icon: <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />,
    },
    success: {
      container: "bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
    },
    warning: {
      container: "bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200",
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
    },
    danger: {
      container: "bg-rose-500/10 border-rose-500/20 text-rose-900 dark:text-rose-200",
      icon: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />,
    },
  };

  const current = styles[type];

  return (
    <div className={`p-3.5 rounded-[var(--radius-main,0.375rem)] border flex items-start gap-2.5 text-xs text-left ${current.container} ${className}`}>
      {current.icon}
      <div className="flex-1 min-w-0">
        {title && <h4 className="font-semibold text-xs mb-0.5">{title}</h4>}
        <div className="leading-relaxed opacity-90">{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
