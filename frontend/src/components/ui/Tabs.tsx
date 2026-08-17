import React from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: "pills" | "underline";
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  className = "",
}) => {
  if (variant === "underline") {
    return (
      <div className={`flex border-b border-[var(--color-border)] gap-6 ${className}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 pb-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer select-none -mb-px ${
                isActive
                  ? "border-[var(--color-primary)] text-[var(--color-primary)] font-semibold"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[11px] font-medium ${
                    isActive
                      ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                      : "bg-[var(--color-surface-muted)] text-[var(--color-muted)]"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Segment / pills variant
  return (
    <div className={`flex items-center gap-1 p-1 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[calc(var(--radius-main,0.375rem)-2px)] text-xs font-medium transition-all cursor-pointer select-none ${
              isActive
                ? "bg-[var(--color-surface)] text-[var(--color-heading)] shadow-xs font-semibold"
                : "text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface)]/50"
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] ${
                  isActive
                    ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold"
                    : "bg-[var(--color-border)] text-[var(--color-muted)]"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
