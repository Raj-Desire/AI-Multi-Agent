import React, { useState, useEffect } from "react";
import { CampaignSchedule } from "../../types";
import { Clock, Calendar, CheckCircle2, AlertTriangle, Globe } from "lucide-react";

interface TimezoneLiveClockProps {
  schedule: CampaignSchedule;
  className?: string;
}

export function TimezoneLiveClock({ schedule, className = "" }: TimezoneLiveClockProps) {
  const [currentTimeStr, setCurrentTimeStr] = useState<string>("");
  const [currentDateStr, setCurrentDateStr] = useState<string>("");
  const [isInsideWindow, setIsInsideWindow] = useState<boolean>(true);
  const [windowStatusReason, setWindowStatusReason] = useState<string>("");

  useEffect(() => {
    function updateClock() {
      const targetTz = schedule?.timezone || "UTC";
      const now = new Date();

      try {
        // Format time in the target IANA timezone
        const timeFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: targetTz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
        setCurrentTimeStr(timeFormatter.format(now));

        // Format date and day in the target IANA timezone
        const dateFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: targetTz,
          weekday: "long",
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        setCurrentDateStr(dateFormatter.format(now));

        // Calling window validation
        // 1. Get 24-hour hour & minute in target timezone
        const partsFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: targetTz,
          hour: "numeric",
          minute: "numeric",
          weekday: "long",
          hour12: false,
        });
        const parts = partsFormatter.formatToParts(now);
        let tzHour = 0;
        let tzMinute = 0;
        let tzDay = "";

        parts.forEach((p) => {
          if (p.type === "hour") tzHour = parseInt(p.value, 10);
          if (p.type === "minute") tzMinute = parseInt(p.value, 10);
          if (p.type === "weekday") tzDay = p.value;
        });

        // 2. Validate day of week
        const allowedDays = (schedule.calling_days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).map(
          (d) => d.trim().toLowerCase()
        );
        const currentDayLower = tzDay.toLowerCase();
        if (!allowedDays.includes(currentDayLower)) {
          setIsInsideWindow(false);
          setWindowStatusReason(`Today is ${tzDay} (not in allowed calling days)`);
          return;
        }

        // 3. Validate start and end time window
        const startParts = (schedule.calling_start_time || "09:00").split(":").map(Number);
        const endParts = (schedule.calling_end_time || "18:00").split(":").map(Number);
        const startMins = startParts[0] * 60 + (startParts[1] || 0);
        const endMins = endParts[0] * 60 + (endParts[1] || 0);
        const currentMins = tzHour * 60 + tzMinute;

        if (currentMins < startMins) {
          setIsInsideWindow(false);
          setWindowStatusReason(`Opens at ${schedule.calling_start_time}`);
        } else if (currentMins >= endMins) {
          setIsInsideWindow(false);
          setWindowStatusReason(`Closed at ${schedule.calling_end_time}`);
        } else {
          setIsInsideWindow(true);
          setWindowStatusReason(`Active until ${schedule.calling_end_time}`);
        }
      } catch (e) {
        setCurrentTimeStr(now.toLocaleTimeString());
        setCurrentDateStr(now.toLocaleDateString());
        setIsInsideWindow(true);
        setWindowStatusReason("Timezone validation fallback");
      }
    }

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [schedule?.timezone, schedule?.calling_start_time, schedule?.calling_end_time, schedule?.calling_days]);

  const cleanTzName = (schedule?.timezone || "UTC").replace(/_/g, " ");

  return (
    <div
      className={`p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${className}`}
    >
      {/* Left: Timezone & Live Clock */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--color-heading)] text-sm">{cleanTzName}</span>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-surface-muted)] text-[var(--color-primary)] border border-[var(--color-border)]">
              {currentTimeStr}
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{currentDateStr}</p>
        </div>
      </div>

      {/* Right: Calling Window Status */}
      <div className="flex items-center gap-2 sm:self-center">
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
            isInsideWindow
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800"
          }`}
        >
          {isInsideWindow ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Inside Calling Window ({windowStatusReason})</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Outside Calling Window ({windowStatusReason})</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
