import React, { useEffect, useMemo, useState } from "react";
import { InfoTooltip } from "../ui/Tooltip";
import { TimeWheelPicker } from "../ui/TimeWheelPicker";

/**
 * Picker-based editor for an agent's own schedule. Values are stored as the plain strings
 * the backend schedule resolver reads (app/agents/schedule.py):
 *   days: "Monday - Friday" | "Monday, Wednesday, Friday"
 *   hours: "8:00 AM - 6:00 PM"
 *   timezone: IANA key, e.g. "America/Chicago"
 *   closed_on: derived from unselected days, e.g. "Saturday, Sunday"
 */
export interface OperatingHoursValue {
  days?: string;
  hours?: string;
  timezone?: string;
  closed_on?: string;
}

interface BusinessHoursPickerProps {
  value?: OperatingHoursValue;
  onChange: (value: OperatingHoursValue | undefined) => void;
}

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "Asia/Kolkata", label: "India (IST, UTC+5:30)" },
  { value: "Asia/Dubai", label: "UAE / Gulf (GST, UTC+4)" },
  { value: "Asia/Singapore", label: "Singapore (SGT, UTC+8)" },
  { value: "Asia/Tokyo", label: "Japan (JST, UTC+9)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "Europe/London", label: "United Kingdom (GMT/BST)" },
  { value: "Europe/Paris", label: "Central Europe (CET/CEST)" },
  { value: "America/New_York", label: "US Eastern (EST/EDT)" },
  { value: "America/Chicago", label: "US Central (CST/CDT)" },
  { value: "America/Denver", label: "US Mountain (MST/MDT)" },
  { value: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { value: "America/Los_Angeles", label: "US Pacific (PST/PDT)" },
  { value: "UTC", label: "UTC" },
];

// 30-minute slots: "12:00 AM" ... "11:30 PM"
const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h24 = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${minutes} ${suffix}`;
});

/** "Monday - Friday" / "Mon, Wed" / "Monday to Saturday" -> set of full day names */
function parseDays(days?: string): Set<string> {
  const selected = new Set<string>();
  if (!days) return selected;
  const find = (token: string) =>
    WEEK.findIndex((d) => d.toLowerCase().startsWith(token.trim().toLowerCase().slice(0, 3)));
  for (const part of days.split(",")) {
    const range = part.split(/\s*(?:-|–|to)\s*/i).filter(Boolean);
    if (range.length === 2) {
      const a = find(range[0]);
      const b = find(range[1]);
      if (a >= 0 && b >= 0) {
        for (let i = a; ; i = (i + 1) % 7) {
          selected.add(WEEK[i]);
          if (i === b) break;
        }
      }
    } else if (range.length === 1) {
      const i = find(range[0]);
      if (i >= 0) selected.add(WEEK[i]);
    }
  }
  return selected;
}

/** Contiguous runs become ranges: Mon,Tue,Wed,Fri -> "Monday - Wednesday, Friday" */
function formatDays(selected: Set<string>): string | undefined {
  const idx = WEEK.map((d, i) => (selected.has(d) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return undefined;
  const runs: string[] = [];
  let start = idx[0];
  let prev = idx[0];
  for (const i of [...idx.slice(1), -1]) {
    if (i === prev + 1) {
      prev = i;
      continue;
    }
    runs.push(prev - start >= 2 ? `${WEEK[start]} - ${WEEK[prev]}` : WEEK.slice(start, prev + 1).join(", "));
    start = prev = i;
  }
  return runs.join(", ");
}

function parseHours(hours?: string): { open: string; close: string; is24h: boolean } {
  if (hours && /24\s*(hours|\/7)/i.test(hours)) return { open: "", close: "", is24h: true };
  const match = hours?.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[-–to]+\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  const norm = (t: string) => t.toUpperCase().replace(/\s*([AP]M)/, " $1");
  return match ? { open: norm(match[1]), close: norm(match[2]), is24h: false } : { open: "", close: "", is24h: false };
}

const fieldClass =
  "w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]/60 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all";

export function BusinessHoursPicker({ value, onChange }: BusinessHoursPickerProps) {
  const selectedDays = useMemo(() => parseDays(value?.days), [value?.days]);
  const parsed = useMemo(() => parseHours(value?.hours), [value?.hours]);
  const is24h = parsed.is24h;
  // Local picks: "hours" is only saved once BOTH times are chosen, so a single pick must
  // live here or the select snaps back to "Select time".
  const [open, setOpen] = useState(parsed.open);
  const [close, setClose] = useState(parsed.close);
  useEffect(() => {
    if (parsed.open || parsed.close || !value?.hours) {
      setOpen(parsed.open);
      setClose(parsed.close);
    }
  }, [parsed.open, parsed.close, value?.hours]);
  const hasCustomHours = Boolean(value?.hours) && !is24h && !parsed.open;

  const emit = (patch: OperatingHoursValue) => {
    const next = { ...(value || {}), ...patch };
    (Object.keys(next) as Array<keyof OperatingHoursValue>).forEach((k) => !next[k] && delete next[k]);
    onChange(Object.keys(next).length ? next : undefined);
  };

  const toggleDay = (day: string) => {
    const nextDays = new Set(selectedDays);
    nextDays.has(day) ? nextDays.delete(day) : nextDays.add(day);
    const closed = WEEK.filter((d) => !nextDays.has(d));
    emit({
      days: formatDays(nextDays),
      closed_on: nextDays.size ? (closed.length ? closed.join(", ") : "None") : undefined,
    });
  };

  const setTimes = (nextOpen: string, nextClose: string) => {
    setOpen(nextOpen);
    setClose(nextClose);
    if (nextOpen && nextClose) emit({ hours: `${nextOpen} - ${nextClose}` });
    else if (value?.hours && !is24h) emit({ hours: undefined });
  };

  const closesBeforeOpening =
    open && close && TIME_SLOTS.indexOf(close) <= TIME_SLOTS.indexOf(open);

  return (
    <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-bold text-[var(--color-heading)]">Business Hours &amp; Timezone</label>
          <InfoTooltip
            content="Optional. The days, hours and timezone this agent books appointments in (e.g. a clinic in Austin uses US Central). Overrides the organization business profile. Leave empty to use the hours written in the agent's knowledge, or your organization hours."
            position="top"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => {
              setOpen("");
              setClose("");
              onChange(undefined);
            }}
            className="text-[10px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Compact Side-by-Side: Operating Days on Left, Hours & Timezone on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Left Column: Operating days */}
        <div className="lg:col-span-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[var(--color-muted)]">Operating Days</span>
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={is24h}
                onChange={(e) => emit({ hours: e.target.checked ? "Open 24 hours" : undefined })}
                className="w-3 h-3 accent-[var(--color-primary)] rounded"
              />
              <span>Open 24/7</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-1">
            {WEEK.map((day) => {
              const active = selectedDays.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(day)}
                  className={`h-7 px-2 text-[10px] font-semibold rounded-full border transition-all ${
                    active
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-2xs"
                      : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-heading)]"
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-[var(--color-muted)] leading-tight">
            {value?.days ? (
              <>
                <span className="font-semibold text-[var(--color-heading)]">{value.days}</span>
                {value.closed_on && value.closed_on !== "None" && <> · Closed: {value.closed_on}</>}
              </>
            ) : (
              "Select open days."
            )}
          </p>
        </div>

        {/* Right Column: Opens At, Closes At, Timezone beside Operating Days */}
        <div className="lg:col-span-7 space-y-1.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Opens At</span>
              <TimeWheelPicker
                disabled={is24h}
                value={open}
                onChange={(val) => setTimes(val, close || "")}
                placeholder="Select time"
                label="Opens At"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Closes At</span>
              <TimeWheelPicker
                disabled={is24h}
                value={close}
                onChange={(val) => setTimes(open || "", val)}
                placeholder="Select time"
                label="Closes At"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-muted)]">Timezone</span>
              <select
                className={fieldClass}
                value={value?.timezone || ""}
                onChange={(e) => emit({ timezone: e.target.value || undefined })}
              >
                <option value="">Use org timezone</option>
                {value?.timezone && !TIMEZONES.some((tz) => tz.value === value.timezone) && (
                  <option value={value.timezone}>{value.timezone}</option>
                )}
                {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>

          {closesBeforeOpening && (
            <p className="text-[10px] font-medium text-[var(--color-danger)]">Closing time must be after opening time.</p>
          )}
          {hasCustomHours && (
            <p className="text-[10px] text-[var(--color-muted)]">
              Current: <span className="font-semibold text-[var(--color-heading)]">{value?.hours}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
