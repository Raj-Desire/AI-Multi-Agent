import React from "react";

export type StatusType = "active" | "connected" | "completed" | "idle" | "pending" | "failed" | "error" | "warning";

interface StatusIndicatorProps {
  status: StatusType | string;
  label?: string;
  className?: string;
  pulse?: boolean;
  size?: "sm" | "md";
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  className = "",
  pulse = false,
  size = "md",
}) => {
  const norm = status.toLowerCase();

  let dotColor = "bg-slate-400";
  let textColor = "text-[var(--color-muted)]";
  let defaultLabel = status;

  if (norm === "active" || norm === "connected" || norm === "completed" || norm === "success" || norm === "ready") {
    dotColor = "bg-[var(--color-success)]";
    textColor = "text-[var(--color-heading)]";
    defaultLabel = norm === "active" ? "Active" : norm === "connected" ? "Connected" : "Completed";
  } else if (norm === "pending" || norm === "dialing" || norm === "ringing" || norm === "in-progress" || norm === "warning") {
    dotColor = "bg-[var(--color-warning)]";
    textColor = "text-[var(--color-heading)]";
    defaultLabel = norm === "dialing" ? "Dialing" : norm === "ringing" ? "Ringing" : "Pending";
  } else if (norm === "failed" || norm === "error" || norm === "busy" || norm === "no-answer" || norm === "canceled") {
    dotColor = "bg-[var(--color-danger)]";
    textColor = "text-[var(--color-heading)]";
    defaultLabel = norm === "no-answer" ? "No Answer" : norm === "busy" ? "Busy" : "Failed";
  } else if (norm === "idle") {
    dotColor = "bg-slate-400";
    textColor = "text-[var(--color-muted)]";
    defaultLabel = "Idle";
  }

  const dotSizes = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
  };

  const textSizes = {
    sm: "text-[11px]",
    md: "text-xs",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${textColor} ${textSizes[size]} ${className}`}>
      <span
        className={`rounded-full shrink-0 ${dotSizes[size]} ${dotColor} ${
          pulse ? "animate-pulse" : ""
        }`}
      />
      <span>{label || defaultLabel}</span>
    </span>
  );
};
