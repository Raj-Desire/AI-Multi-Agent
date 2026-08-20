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
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-7 h-7",
  };

  const content = (
    <div className={`flex flex-col items-center justify-center gap-2.5 py-8 px-4 text-center animate-fade-in ${className}`}>
      {/* Clean, high-tech minimalist spinner */}
      <div className="relative flex items-center justify-center">
        <Loader2 className={`${iconSizeMap[size]} text-[var(--color-primary)] animate-spin stroke-[2.25]`} />
      </div>

      {/* Primary & Sub-message */}
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-[var(--color-heading)] tracking-tight">
          {message}
        </p>
        {subMessage && (
          <p className="text-[11px] text-[var(--color-muted)] max-w-xs leading-relaxed">
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen w-full bg-[var(--color-background)] flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
};

