import React from "react";

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
  const sizeMap = {
    sm: "w-5 h-5 border-2",
    md: "w-8 h-8 border-2.5",
    lg: "w-11 h-11 border-3",
  };

  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${className}`}>
      {/* High-fidelity circle loader */}
      <div className="relative flex items-center justify-center">
        <div
          className={`${sizeMap[size]} rounded-full border-solid border-[var(--color-border)] animate-spin`}
          style={{
            borderTopColor: "var(--color-primary, #4f46e5)",
            borderRightColor: "var(--color-primary, #4f46e5)",
          }}
        />
        <div
          className="absolute inset-0 rounded-full blur-xs opacity-25"
          style={{ backgroundColor: "var(--color-primary, #4f46e5)" }}
        />
      </div>

      {/* Primary & Sub-message */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[var(--color-heading)] tracking-wide">
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

