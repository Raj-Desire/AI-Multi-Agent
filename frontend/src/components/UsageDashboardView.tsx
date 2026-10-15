import React, { useState, useEffect } from 'react';
import { OrgDashboardPayload, LedgerItem, CreditAuditLog } from '../types';
import { fetchApi } from '../api-client';
import { CreditHealthBar } from './CreditHealthBar';
import { DailyUsageChart } from './DailyUsageChart';
import { PageHeader } from './ui/PageHeader';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import { DataTable, Column } from './ui/DataTable';
import { Modal } from './ui/Modal';
import {
  CreditCard,
  Clock,
  CheckCircle,
  Users,
  Megaphone,
  PhoneCall,
  RefreshCw,
  History,
  TrendingUp,
  Coins
} from 'lucide-react';

export const UsageDashboardView: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<OrgDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartDays, setChartDays] = useState(30);

  // Audit history modal
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<CreditAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<OrgDashboardPayload>(`/credits/my-org/dashboard?days=${chartDays}`);
      setDashboardData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load usage dashboard telemetry.');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditHistory = async () => {
    try {
      setLoadingAudit(true);
      const logs = await fetchApi<CreditAuditLog[]>('/credits/my-org/audit?limit=50');
      setAuditLogs(logs);
      setShowAuditModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load credit history.');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [chartDays]);

  const ledgerColumns: Column<LedgerItem>[] = [
    {
      key: 'created_at',
      header: 'Time / Date',
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-medium text-xs text-[var(--color-heading)]">
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[10px] text-[var(--color-muted)]">
            {new Date(item.created_at).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      key: 'call_id',
      header: 'Call Reference',
      render: (item) => (
        <span className="font-mono text-xs text-[var(--color-heading)]">
          {item.call_id ? item.call_id.slice(-8) : item.id.slice(-8)}
        </span>
      ),
    },
    {
      key: 'agent_name',
      header: 'Agent',
      render: (item) => (
        <span className="text-xs font-medium text-[var(--color-heading)]">
          {item.agent_name || 'Voice Assistant'}
        </span>
      ),
    },
    {
      key: 'duration_seconds',
      header: 'Talk Duration',
      sortable: true,
      render: (item) => {
        const mins = Math.floor(item.duration_seconds / 60);
        const secs = item.duration_seconds % 60;
        return (
          <span className="font-mono text-xs text-[var(--color-heading)]">
            {mins}:{secs < 10 ? `0${secs}` : secs}
          </span>
        );
      },
    },
    {
      key: 'credits_consumed_minutes',
      header: 'Credits Deducted',
      sortable: true,
      render: (item) => (
        <span className="font-mono font-medium text-xs text-rose-500">
          -{item.credits_consumed_minutes.toFixed(2)} min
        </span>
      ),
    },
    {
      key: 'total_tokens',
      header: 'Tokens Processed',
      render: (item) => (
        <span className="font-mono text-xs text-[var(--color-muted)]">
          {item.total_tokens ? item.total_tokens.toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Usage & Credit Pool Dashboard"
        description="Real-time multi-tenant telephony consumption, shared organization credit balances, and resource quotas."
        badge={
          <Badge variant="primary" size="sm">
            {dashboardData?.plan_name || 'Standard'} Plan
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAuditHistory}
              isLoading={loadingAudit}
              leftIcon={<History className="w-3.5 h-3.5" />}
            >
              Credit History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync Balance
            </Button>
          </div>
        }
      />

      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 4 Stat Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Allocated */}
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)] font-medium mb-1">
            <span>Total Credit Cap</span>
            <Coins className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-heading)]">
            {dashboardData?.total_credits_minutes.toLocaleString() || 0}
            <span className="text-xs font-normal text-[var(--color-muted)] ml-1">min</span>
          </div>
          <div className="text-[11px] text-[var(--color-muted)] mt-1">
            {dashboardData?.period_end
              ? `Renews ${new Date(dashboardData.period_end).toLocaleDateString()}`
              : 'Monthly cycle subscription'}
          </div>
        </div>

        {/* Card 2: Consumed Minutes */}
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)] font-medium mb-1">
            <span>Consumed Talk-Time</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-heading)]">
            {dashboardData?.used_minutes.toFixed(1) || '0.0'}
            <span className="text-xs font-normal text-[var(--color-muted)] ml-1">min</span>
          </div>
          <div className="text-[11px] text-[var(--color-muted)] mt-1">
            Across {dashboardData?.counters.total_calls_count || 0} total calls placed
          </div>
        </div>

        {/* Card 3: Remaining Balance */}
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)] font-medium mb-1">
            <span>Remaining Credits</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-500">
            {dashboardData?.remaining_minutes.toFixed(1) || '0.0'}
            <span className="text-xs font-normal text-[var(--color-muted)] ml-1">min</span>
          </div>
          <div className="text-[11px] text-[var(--color-muted)] mt-1">
            {dashboardData?.projected_depletion_date
              ? `Est. depletion: ${dashboardData.projected_depletion_date}`
              : 'Ample balance available'}
          </div>
        </div>

        {/* Card 4: Resource Counters */}
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)] font-medium mb-1">
            <span>Organization Resources</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[var(--color-muted)]" />
              <span className="text-sm font-semibold font-mono text-[var(--color-heading)]">
                {dashboardData?.counters.total_agents || 0}
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">
                {dashboardData?.counters.max_agents_allowed ? `/${dashboardData.counters.max_agents_allowed} Agents` : 'Agents'}
              </span>
            </div>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <div className="flex items-center gap-1.5">
              <Megaphone className="w-3.5 h-3.5 text-[var(--color-muted)]" />
              <span className="text-sm font-semibold font-mono text-[var(--color-heading)]">
                {dashboardData?.counters.total_campaigns || 0}
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">
                {dashboardData?.counters.max_campaigns_allowed ? `/${dashboardData.counters.max_campaigns_allowed} Camps` : 'Campaigns'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-[var(--color-muted)] mt-1.5">
            Quotas shared by all organization users
          </div>
        </div>
      </div>

      {/* Credit Pool Health Progress Bar */}
      {dashboardData && (
        <CreditHealthBar
          usedMinutes={dashboardData.used_minutes}
          totalMinutes={dashboardData.total_credits_minutes}
          remainingMinutes={dashboardData.remaining_minutes}
          usagePercentage={dashboardData.usage_percentage}
          status={dashboardData.status}
          isEnforced={dashboardData.is_credit_enforced}
        />
      )}

      {/* Daily Usage Chart */}
      <DailyUsageChart
        metrics={dashboardData?.daily_metrics || []}
        days={chartDays}
        onDaysChange={setChartDays}
      />

      {/* Recent Call Usage Ledger */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-[var(--color-muted)]" />
            <h3 className="text-xs font-semibold text-[var(--color-heading)]">Call Usage Ledger</h3>
            <span className="text-[11px] text-[var(--color-muted)]">(Last 50 calls)</span>
          </div>
        </div>

        <DataTable
          columns={ledgerColumns}
          data={dashboardData?.recent_ledger || []}
          isLoading={loading}
          loadingMessage="Loading call deduction ledger..."
          searchKey="agent_name"
          searchPlaceholder="Search calls by agent name..."
          emptyTitle="No usage recorded yet"
          emptyDescription="When your team or automated campaigns place phone calls, minute deductions appear here."
          pagination={true}
          pageSize={10}
        />
      </div>

      {/* Credit Assignment & Top-up History Modal */}
      <Modal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        title="Credit Allocation & Top-Up History"
        description="Immutable record of credit assignments, renewals, and adjustments."
        maxWidth="lg"
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {auditLogs.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] text-center py-6">No credit adjustments on record.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
                        {log.action}
                      </span>
                      <span className="font-medium text-[var(--color-heading)]">
                        {log.delta_minutes > 0 ? `+${log.delta_minutes} min` : `${log.delta_minutes} min`}
                      </span>
                    </div>
                    {log.reason && (
                      <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{log.reason}</p>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-[var(--color-muted)]">
                    <div>{new Date(log.created_at).toLocaleDateString()}</div>
                    <div className="font-mono text-[10px]">{log.assigned_by_user}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
