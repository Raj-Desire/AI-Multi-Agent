import React from "react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-[var(--radius-main,0.375rem)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)]/30 ${className}`}
    >
      {icon && (
        <div className="w-10 h-10 rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-muted)] flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-semibold text-[var(--color-heading)]">{title}</h4>
      {description && (
        <p className="text-xs text-[var(--color-muted)] max-w-sm mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
