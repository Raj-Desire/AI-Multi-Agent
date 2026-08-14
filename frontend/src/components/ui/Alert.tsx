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
      container: "bg-sky-50/90 border-sky-200 text-sky-950",
      icon: <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />,
    },
    success: {
      container: "bg-emerald-50/90 border-emerald-200 text-emerald-950",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
    },
    warning: {
      container: "bg-amber-50/90 border-amber-200 text-amber-950",
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
    },
    danger: {
      container: "bg-rose-50/90 border-rose-200 text-rose-950",
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />,
    },
  };

  const current = styles[type];

  return (
    <div className={`p-4 rounded-xl border flex items-start gap-3 text-sm ${current.container} ${className} shadow-2xs`}>
      {current.icon}
      <div className="flex-1">
        {title && <h4 className="font-bold text-sm mb-0.5 text-sky-950">{title}</h4>}
        <div className="text-xs leading-relaxed font-medium">{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-black/5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
