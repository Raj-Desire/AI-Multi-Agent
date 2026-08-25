import React from "react";
import { Loader2 } from "lucide-react";

export interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  size?: "sm" | "md" | "lg";
  fullPage?: boolean;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading data...",
  subMessage,
  size = "md",
  fullPage = false,
  className = "",
}) => {
  const iconSizeMap = {
    sm: "w-5 h-5",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  };

  const content = (
    <div className={`flex flex-col items-center justify-center gap-3.5 py-8 px-4 text-center animate-fade-in ${className}`}>
      {/* Sleek, glowing high-tech spinner */}
      <div className="relative flex items-center justify-center">
        <div className="absolute w-12 h-12 rounded-full bg-[var(--color-primary)]/15 blur-md animate-pulse" />
        <Loader2 className={`${iconSizeMap[size]} text-[var(--color-primary)] animate-spin stroke-[2] relative z-10`} />
      </div>

      {/* Primary & Sub-message */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-[var(--color-heading)] tracking-tight">
          {message}
        </p>
        {subMessage && (
          <p className="text-[11px] text-[var(--color-muted)] max-w-xs leading-relaxed font-normal">
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen w-full bg-[var(--color-background)] flex items-center justify-center transition-colors duration-200">
        {content}
      </div>
    );
  }

  return content;
};

