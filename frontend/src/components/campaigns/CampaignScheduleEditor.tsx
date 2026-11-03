import React, { useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../api-client";
import { Campaign, CampaignSchedule } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { toast } from "sonner";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface CampaignScheduleEditorProps {
  campaignId: string;
  schedule: CampaignSchedule;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: Campaign) => void;
}

/** Edits a campaign's run dates, daily calling window, calling days and timezone. */
export function CampaignScheduleEditor({ campaignId, schedule, isOpen, onClose, onSaved }: CampaignScheduleEditorProps) {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("18:00");
  const [days, setDays] = useState<string[]>([]);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [saving, setSaving] = useState<boolean>(false);

  // Start from the campaign's current schedule every time the editor opens
  useEffect(() => {
    if (!isOpen) return;
    setStartDate(schedule.start_date || "");
    setEndDate(schedule.end_date || "");
    setStartTime(schedule.calling_start_time || "09:00");
    setEndTime(schedule.calling_end_time || "18:00");
    setDays(schedule.calling_days || []);
    setTimezone(schedule.timezone || "UTC");
  }, [isOpen, schedule]);

  const timezones = useMemo(() => {
    let all: string[] = [];
    try {
      all = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf("timeZone") : [];
    } catch {
      all = [];
    }
    const list = all.length ? all : ["UTC", "Asia/Kolkata", "America/New_York", "Europe/London"];
    return list.includes(timezone) ? list : [timezone, ...list];
  }, [timezone]);

  const toggleDay = (day: string) =>
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

  const handleSave = async () => {
    if (endDate && startDate && endDate < startDate) {
      toast.error("End date cannot be earlier than the start date.");
      return;
    }
    if (days.length === 0) {
      toast.error("Select at least one calling day.");
      return;
    }
    if (startTime >= endTime) {
      toast.error("The calling window must end after it starts.");
      return;
    }
    setSaving(true);
    try {
      const updated = await fetchApi<Campaign>(`/campaigns/${campaignId}`, {
        method: "PUT",
        body: JSON.stringify({
          schedule: {
            start_date: startDate || null,
            end_date: endDate || null,
            calling_days: days,
            calling_start_time: startTime,
            calling_end_time: endTime,
            timezone,
          },
        }),
      });
      toast.success(endDate ? `Schedule saved. Calls stop after ${endDate}.` : "Schedule saved.");
      onSaved(updated);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Could not save the schedule.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]";

  return (
    <Modal isOpen={isOpen} onClose={() => !saving && onClose()} title="Edit Campaign Schedule" maxWidth="lg">
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="font-semibold text-[var(--color-heading)]">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="font-semibold text-[var(--color-heading)]">End Date (optional)</label>
            <input type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </div>
        </div>

        <p className="text-[11px] leading-snug text-[var(--color-muted)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md px-3 py-2">
          {endDate
            ? `Calls are placed on each selected day from ${startDate || "the start date"} through ${endDate}, only inside the calling window. After ${endDate} the campaign ends and no further call is made.`
            : "With no end date the campaign keeps calling on each selected day until you stop it."}
        </p>

        <div className="space-y-1.5">
          <label className="font-semibold text-[var(--color-heading)]">Calling Days</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  days.includes(day)
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] font-semibold"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                }`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="font-semibold text-[var(--color-heading)]">Daily Calling Window</label>
            <div className="flex items-center gap-2">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
              <span className="font-bold text-[var(--color-muted)]">to</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="font-semibold text-[var(--color-heading)]">Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Schedule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
