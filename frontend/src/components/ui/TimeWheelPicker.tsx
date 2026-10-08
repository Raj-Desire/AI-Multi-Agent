import React, { useEffect, useRef, useState } from "react";
import { Clock, ChevronDown, Check, X } from "lucide-react";

interface TimeWheelPickerProps {
  value: string; // e.g. "08:00 AM", "8:00 AM", or ""
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1 to 12
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const PERIODS = ["AM", "PM"] as const;

function parseTimeString(val: string): { hour: number; minute: string; period: "AM" | "PM" } {
  if (!val) return { hour: 9, minute: "00", period: "AM" };
  const match = val.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return { hour: 9, minute: "00", period: "AM" };
  let h = parseInt(match[1], 10);
  if (h < 1 || h > 12) h = 12;
  const m = match[2];
  const p = match[3].toUpperCase() === "PM" ? "PM" : "AM";
  return { hour: h, minute: m, period: p };
}

export function TimeWheelPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Select time",
  label
}: TimeWheelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parseTimeString(value);
  const [tempHour, setTempHour] = useState<number>(parsed.hour);
  const [tempMinute, setTempMinute] = useState<string>(parsed.minute);
  const [tempPeriod, setTempPeriod] = useState<"AM" | "PM">(parsed.period);

  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      const p = parseTimeString(value);
      setTempHour(p.hour);
      setTempMinute(p.minute);
      setTempPeriod(p.period);
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Auto-scroll the active items into center when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (hourScrollRef.current) {
          const activeH = hourScrollRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
          if (activeH) {
            hourScrollRef.current.scrollTop = activeH.offsetTop - hourScrollRef.current.clientHeight / 2 + activeH.clientHeight / 2;
          }
        }
        if (minuteScrollRef.current) {
          const activeM = minuteScrollRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
          if (activeM) {
            minuteScrollRef.current.scrollTop = activeM.offsetTop - minuteScrollRef.current.clientHeight / 2 + activeM.clientHeight / 2;
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleApply = (h = tempHour, m = tempMinute, p = tempPeriod) => {
    const formatted = `${h}:${m} ${p}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  const selectHour = (h: number) => {
    setTempHour(h);
    const formatted = `${h}:${tempMinute} ${tempPeriod}`;
    onChange(formatted);
  };

  const selectMinute = (m: string) => {
    setTempMinute(m);
    const formatted = `${tempHour}:${m} ${tempPeriod}`;
    onChange(formatted);
  };

  const selectPeriod = (p: "AM" | "PM") => {
    setTempPeriod(p);
    const formatted = `${tempHour}:${tempMinute} ${p}`;
    onChange(formatted);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] border rounded-lg text-left flex items-center justify-between gap-1.5 transition-all select-none ${
          disabled
            ? "opacity-50 cursor-not-allowed border-[var(--color-border)] bg-[var(--color-surface-muted)]"
            : isOpen
            ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 shadow-sm"
            : "border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Clock className={`w-3.5 h-3.5 shrink-0 ${value ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
          {value ? (
            <span className="font-semibold text-[var(--color-heading)] truncate">{value}</span>
          ) : (
            <span className="text-[var(--color-muted)] truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
              title="Clear time"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-[var(--color-muted)] transition-transform duration-200 ${
              isOpen ? "rotate-180 text-[var(--color-primary)]" : ""
            }`}
          />
        </div>
      </button>

      {/* Popover Wheel / Column Scroller */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 z-50 w-[240px] sm:w-[260px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl p-2.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-[var(--color-border)]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
              {label || "Set Time"}
            </span>
            <div className="flex items-center gap-1 bg-[var(--color-primary-light)]/40 px-2 py-0.5 rounded-full border border-[var(--color-primary)]/20">
              <span className="text-xs font-bold text-[var(--color-primary)] font-mono">
                {tempHour.toString().padStart(2, "0")}:{tempMinute} {tempPeriod}
              </span>
            </div>
          </div>

          {/* 3 Wheel Columns: Hour | Minute | AM/PM */}
          <div className="grid grid-cols-3 gap-1.5 bg-[var(--color-surface-muted)]/50 p-1.5 rounded-lg border border-[var(--color-border)]">
            {/* Hours Column */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-center text-[var(--color-muted)] uppercase tracking-wide">
                Hour
              </div>
              <div
                ref={hourScrollRef}
                className="h-[148px] overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin overscroll-contain"
              >
                {HOURS_12.map((h) => {
                  const isSelected = tempHour === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-active={isSelected}
                      onClick={() => selectHour(h)}
                      className={`w-full py-1.5 text-xs font-semibold rounded-md transition-all text-center flex items-center justify-center ${
                        isSelected
                          ? "bg-[var(--color-primary)] text-white shadow-2xs font-bold"
                          : "text-[var(--color-heading)] hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
                      }`}
                    >
                      {h.toString().padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minutes Column */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-center text-[var(--color-muted)] uppercase tracking-wide">
                Min
              </div>
              <div
                ref={minuteScrollRef}
                className="h-[148px] overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin overscroll-contain"
              >
                {MINUTES.map((m) => {
                  const isSelected = tempMinute === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-active={isSelected}
                      onClick={() => selectMinute(m)}
                      className={`w-full py-1.5 text-xs font-semibold rounded-md transition-all text-center flex items-center justify-center ${
                        isSelected
                          ? "bg-[var(--color-primary)] text-white shadow-2xs font-bold"
                          : "text-[var(--color-heading)] hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
                      }`}
                    >
                      :{m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AM / PM Segment */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-center text-[var(--color-muted)] uppercase tracking-wide">
                Period
              </div>
              <div className="h-[148px] flex flex-col justify-center gap-1.5 px-0.5">
                {PERIODS.map((p) => {
                  const isSelected = tempPeriod === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => selectPeriod(p)}
                      className={`w-full py-2.5 text-xs font-bold rounded-md transition-all text-center flex items-center justify-center border ${
                        isSelected
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-2xs"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-heading)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-1 gap-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)] rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleApply()}
              className="px-3 py-1 text-xs font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover,var(--color-primary))] rounded-md transition-colors shadow-2xs flex items-center gap-1"
            >
              <Check className="w-3 h-3 stroke-[2.5]" />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
