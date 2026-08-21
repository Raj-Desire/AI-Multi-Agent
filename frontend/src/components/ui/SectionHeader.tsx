import { InfoTooltip } from "./Tooltip";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  tooltip?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  tooltip,
  badge,
  actions,
  className = "",
}) => {
  return (
    <div className={`flex items-start sm:items-center justify-between gap-4 mb-4 text-left ${className}`}>
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm sm:text-base font-semibold tracking-tight text-[var(--color-heading)]">{title}</h2>
          {tooltip && <InfoTooltip content={tooltip} />}
          {badge}
        </div>
        {description && <p className="text-xs text-[var(--color-muted)] mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};
