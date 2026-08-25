import React from "react";
import { InfoTooltip } from "./Tooltip";

export interface FormSectionProps {
  title: string;
  description?: string;
  tooltip?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  tooltip,
  children,
  actions,
  className = "",
}) => {
  return (
    <div className={`py-6 border-b border-[var(--color-border)] last:border-b-0 text-left ${className}`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Title & Description */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-[var(--color-heading)]">{title}</h3>
            {tooltip && <InfoTooltip content={tooltip} position="top" />}
          </div>
          {description && (
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">{description}</p>
          )}
        </div>

        {/* Right Column: Fields & Inputs */}
        <div className="lg:col-span-2 space-y-4">
          {children}
          {actions && <div className="pt-3 flex items-center gap-3">{actions}</div>}
        </div>
      </div>
    </div>
  );
};
