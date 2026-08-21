import React, { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  delayMs?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  className = "",
  delayMs = 150,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const hide = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!content) return <>{children}</>;

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-slate-900 dark:border-t-slate-800 border-x-transparent border-b-transparent border-t-4 border-x-4 border-b-0",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 dark:border-b-slate-800 border-x-transparent border-t-transparent border-b-4 border-x-4 border-t-0",
    left: "left-full top-1/2 -translate-y-1/2 border-l-slate-900 dark:border-l-slate-800 border-y-transparent border-r-transparent border-l-4 border-y-4 border-r-0",
    right: "right-full top-1/2 -translate-y-1/2 border-r-slate-900 dark:border-r-slate-800 border-y-transparent border-l-transparent border-r-4 border-y-4 border-l-0",
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-50 pointer-events-none whitespace-normal max-w-xs w-max min-w-[140px] px-2.5 py-1.5 text-[11px] leading-snug font-normal text-slate-100 bg-slate-900 dark:bg-slate-800 dark:text-slate-200 border border-slate-700/80 rounded-md shadow-xl animate-fade-in ${positionClasses[position]}`}
        >
          {content}
          <span className={`absolute w-0 h-0 pointer-events-none ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  );
};

export interface InfoTooltipProps {
  content: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  iconClassName?: string;
  size?: number;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  position = "top",
  className = "",
  iconClassName = "text-[var(--color-muted)] hover:text-[var(--color-primary)]",
  size = 13,
}) => {
  if (!content) return null;

  return (
    <Tooltip content={content} position={position} className={className}>
      <button
        type="button"
        tabIndex={0}
        aria-label="More information"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`inline-flex items-center justify-center p-0.5 rounded-full transition-colors cursor-help shrink-0 opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] ${iconClassName}`}
      >
        <Info style={{ width: size, height: size }} />
      </button>
    </Tooltip>
  );
};
