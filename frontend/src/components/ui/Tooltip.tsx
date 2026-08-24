import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  delayMs = 80,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowLeft: number }>({
    top: 0,
    left: 0,
    arrowLeft: 0,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const calculatePosition = () => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 260; // Estimated standard tooltip width
    const tooltipHeight = 60;
    const padding = 16;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let targetTop = 0;
    let targetLeft = 0;

    // Calculate vertical position (top preferred)
    if (position === "top" || position === "bottom") {
      if (position === "top") {
        targetTop = triggerRect.top + scrollY - 8; // positioned above
      } else {
        targetTop = triggerRect.bottom + scrollY + 8; // positioned below
      }

      // Horizontal alignment centered on icon, bounded by screen edges
      const triggerCenter = triggerRect.left + scrollX + triggerRect.width / 2;
      let left = triggerCenter - tooltipWidth / 2;

      // Prevent clipping on left or right edge
      if (left < padding) {
        left = padding;
      } else if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - padding - tooltipWidth;
      }

      targetLeft = left;
      const arrowLeft = Math.max(12, Math.min(tooltipWidth - 12, triggerCenter - left));

      setCoords({
        top: targetTop,
        left: targetLeft,
        arrowLeft,
      });
    } else {
      // Fallback for left/right
      targetTop = triggerRect.top + scrollY;
      targetLeft = position === "left" ? triggerRect.left + scrollX - tooltipWidth - 8 : triggerRect.right + scrollX + 8;
      setCoords({
        top: targetTop,
        left: targetLeft,
        arrowLeft: tooltipWidth / 2,
      });
    }
  };

  const show = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    calculatePosition();
    timerRef.current = setTimeout(() => {
      setIsMounted(true);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    }, delayMs);
  };

  const hide = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
    timerRef.current = setTimeout(() => {
      setIsMounted(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!content) return <>{children}</>;

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative inline-flex items-center ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>

      {isMounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: "absolute",
              top: position === "top" ? `${coords.top}px` : `${coords.top}px`,
              left: `${coords.left}px`,
              width: "max-content",
              maxWidth: "280px",
              transform: position === "top" ? "translateY(-100%)" : "none",
            }}
            className={`z-[9999] pointer-events-none px-3 py-2 text-[11px] leading-relaxed font-normal text-slate-100 bg-slate-900 dark:bg-slate-900 dark:text-slate-100 border border-slate-700/90 rounded-md shadow-2xl transition-all duration-150 ease-out ${
              isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            {content}
            {position === "top" && (
              <span
                style={{ left: `${coords.arrowLeft}px` }}
                className="absolute top-full -translate-x-1/2 w-0 h-0 border-t-slate-900 border-x-transparent border-b-transparent border-t-4 border-x-4 border-b-0"
              />
            )}
            {position === "bottom" && (
              <span
                style={{ left: `${coords.arrowLeft}px` }}
                className="absolute bottom-full -translate-x-1/2 w-0 h-0 border-b-slate-900 border-x-transparent border-t-transparent border-b-4 border-x-4 border-t-0"
              />
            )}
          </div>,
          document.body
        )}
    </>
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
