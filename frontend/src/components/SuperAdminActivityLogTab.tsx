import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { fetchApi, LIVE } from "../api-client";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { DataTable, Column } from "./ui/DataTable";

interface ActivityLogEntry {
  id: string;
  username: string;
  org_name?: string | null;
  ip_address: string;
  category: "login" | "action";
  action: string;
  message: string;
  timestamp: string;
}

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString(undefined, { weekday: "long" });
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${day}, ${date} ${time}`;
};

export const SuperAdminActivityLogTab: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "login" | "action">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === "all" ? "" : `&category=${filter}`;
      const res = await fetchApi<ActivityLogEntry[]>(`/superadmin/activity-logs?limit=500${qs}`, LIVE);
      setLogs(res);
    } catch (err: any) {
      setError(err.message || "Failed to load activity log.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<ActivityLogEntry>[] = [
    {
      key: "message",
      header: "Activity",
      render: (l) => (
        <div className="flex items-center gap-2">
          <Badge variant={l.category === "login" ? "info" : "primary"} size="sm">
            {l.category === "login" ? "Login" : "Action"}
          </Badge>
          <span className="text-xs text-[var(--color-heading)]">{l.message}</span>
        </div>
      ),
    },
    {
      key: "username",
      header: "User",
      sortable: true,
      render: (l) => (
        <div>
          <div className="text-xs font-medium text-[var(--color-heading)]">{l.username}</div>
          {l.org_name && <div className="text-[11px] text-[var(--color-muted)]">{l.org_name}</div>}
        </div>
      ),
    },
    {
      key: "ip_address",
      header: "IP Address",
      sortable: true,
      render: (l) => <span className="text-xs font-mono">{l.ip_address}</span>,
    },
    {
      key: "timestamp",
      header: "Day & Time",
      sortable: true,
      render: (l) => <span className="text-xs text-[var(--color-muted)]">{formatWhen(l.timestamp)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-heading)]">
          <ScrollText className="w-4 h-4" /> Login & Activity Log
        </div>
        <div className="flex items-center gap-2">
          {(["all", "login", "action"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "primary" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "login" ? "Logins" : "Actions"}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {error && <Alert type="danger">{error}</Alert>}
      <DataTable
        columns={columns}
        data={logs}
        searchKey="message"
        searchPlaceholder="Search by user, IP or action..."
        isLoading={loading}
        emptyTitle="No activity recorded yet."
        pageSize={15}
      />
    </div>
  );
};
