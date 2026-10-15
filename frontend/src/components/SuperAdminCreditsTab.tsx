import React, { useState, useEffect } from 'react';
import { SuperAdminOrgCreditItem, CreditAuditLog } from '../types';
import { fetchApi } from '../api-client';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { StatusIndicator } from './ui/StatusIndicator';
import { DataTable, Column } from './ui/DataTable';
import {
  Coins,
  PlusCircle,
  Settings,
  History,
  MinusCircle,
  Building2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Users,
  Megaphone,
  RefreshCw
} from 'lucide-react';

export const SuperAdminCreditsTab: React.FC = () => {
  const [orgCredits, setOrgCredits] = useState<SuperAdminOrgCreditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal 1: Assign Plan & Quotas
  const [selectedOrg, setSelectedOrg] = useState<SuperAdminOrgCreditItem | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [planName, setPlanName] = useState('Standard');
  const [totalMinutes, setTotalMinutes] = useState(300);
  const [maxAgents, setMaxAgents] = useState<number | ''>('');
  const [maxCampaigns, setMaxCampaigns] = useState<number | ''>('');
  const [isEnforced, setIsEnforced] = useState(true);
  const [exhaustedAction, setExhaustedAction] = useState<'block' | 'warn_only'>('block');
  const [lowThresholdPct, setLowThresholdPct] = useState(20);
  const [assignReason, setAssignReason] = useState('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Modal 2: Quick Top-Up
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpMinutes, setTopUpMinutes] = useState(60);
  const [topUpReason, setTopUpReason] = useState('');
  const [submittingTopUp, setSubmittingTopUp] = useState(false);

  // Modal 3: Deduct Minutes
  const [showDeductModal, setShowDeductModal] = useState(false);
  const [deductMinutes, setDeductMinutes] = useState(30);
  const [deductReason, setDeductReason] = useState('');
  const [submittingDeduct, setSubmittingDeduct] = useState(false);

  // Modal 4: Audit Logs
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<CreditAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<SuperAdminOrgCreditItem[]>('/superadmin/credits');
      setOrgCredits(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load credit management data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAssignModal = (org: SuperAdminOrgCreditItem) => {
    setSelectedOrg(org);
    setPlanName(org.plan_name || 'Standard');
    setTotalMinutes(org.total_credits_minutes || 300);
    setMaxAgents(org.max_agents_allowed ?? '');
    setMaxCampaigns(org.max_campaigns_allowed ?? '');
    setIsEnforced(org.is_credit_enforced);
    setExhaustedAction(org.credit_exhausted_action || 'block');
    setLowThresholdPct(org.low_credit_threshold_pct || 20);
    setAssignReason('');
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    try {
      setSubmittingAssign(true);
      setError(null);
      await fetchApi(`/superadmin/credits/${selectedOrg.organization_id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          total_minutes: Number(totalMinutes),
          plan_name: planName,
          is_enforced: isEnforced,
          exhausted_action: exhaustedAction,
          low_threshold_pct: Number(lowThresholdPct),
          max_agents: maxAgents !== '' ? Number(maxAgents) : null,
          max_campaigns: maxCampaigns !== '' ? Number(maxCampaigns) : null,
          reason: assignReason || `Updated by SuperAdmin`
        }),
      });
      setSuccessMsg(`Successfully configured ${selectedOrg.org_name} subscription credits.`);
      setShowAssignModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update organization credits.');
    } finally {
      setSubmittingAssign(false);
    }
  };

  const openTopUpModal = (org: SuperAdminOrgCreditItem) => {
    setSelectedOrg(org);
    setTopUpMinutes(60);
    setTopUpReason('Purchased minute top-up package');
    setShowTopUpModal(true);
  };

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    try {
      setSubmittingTopUp(true);
      setError(null);
      await fetchApi(`/superadmin/credits/${selectedOrg.organization_id}/add`, {
        method: 'POST',
        body: JSON.stringify({
          add_minutes: Number(topUpMinutes),
          reason: topUpReason
        }),
      });
      setSuccessMsg(`Added +${topUpMinutes} minutes to ${selectedOrg.org_name}.`);
      setShowTopUpModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add top-up credits.');
    } finally {
      setSubmittingTopUp(false);
    }
  };

  const openDeductModal = (org: SuperAdminOrgCreditItem) => {
    setSelectedOrg(org);
    const maxAvail = Math.max(0, Math.floor(org.remaining_minutes));
    setDeductMinutes(maxAvail > 0 ? Math.min(30, maxAvail) : 0);
    setDeductReason('Administrative balance adjustment');
    setShowDeductModal(true);
  };

  const handleDeductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;

    const maxAvailable = selectedOrg.remaining_minutes;
    if (deductMinutes <= 0) {
      setError('Please enter a valid positive number of minutes to deduct.');
      return;
    }
    if (deductMinutes > maxAvailable) {
      setError(`Cannot deduct more than available balance (${maxAvailable.toFixed(1)} minutes).`);
      return;
    }

    try {
      setSubmittingDeduct(true);
      setError(null);
      await fetchApi(`/superadmin/credits/${selectedOrg.organization_id}/deduct`, {
        method: 'POST',
        body: JSON.stringify({
          deduct_minutes: Number(deductMinutes),
          reason: deductReason
        }),
      });
      setSuccessMsg(`Deducted -${deductMinutes} minutes from ${selectedOrg.org_name}.`);
      setShowDeductModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to deduct credits.');
    } finally {
      setSubmittingDeduct(false);
    }
  };

  const openAuditLogs = async (org: SuperAdminOrgCreditItem) => {
    setSelectedOrg(org);
    try {
      setLoadingAudit(true);
      const logs = await fetchApi<CreditAuditLog[]>(`/superadmin/credits/${org.organization_id}/audit-log?limit=50`);
      setAuditLogs(logs);
      setShowAuditModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load credit audit history.');
    } finally {
      setLoadingAudit(false);
    }
  };

  // Aggregated platform totals
  const totalAllocatedMinutes = orgCredits.reduce((acc, o) => acc + o.total_credits_minutes, 0);
  const totalUsedMinutes = orgCredits.reduce((acc, o) => acc + o.used_minutes, 0);
  const orgsInWarning = orgCredits.filter((o) => o.status === 'warning' || o.status === 'critical').length;
  const orgsExhausted = orgCredits.filter((o) => o.status === 'exhausted').length;

  const columns: Column<SuperAdminOrgCreditItem>[] = [
    {
      key: 'org_name',
      header: 'Organization',
      sortable: true,
      render: (org) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[var(--color-surface-muted)] text-[var(--color-heading)] flex items-center justify-center font-medium text-xs border border-[var(--color-border)]">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="font-medium text-xs text-[var(--color-heading)]">{org.org_name}</div>
            <div className="text-[10px] font-mono text-[var(--color-muted)]">{org.organization_id}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'plan_name',
      header: 'Plan Tier',
      render: (org) => (
        <Badge variant="primary" size="sm">
          {org.plan_name || 'Standard'}
        </Badge>
      ),
    },
    {
      key: 'total_credits_minutes',
      header: 'Credit Balance',
      sortable: true,
      render: (org) => (
        <div>
          <div className="text-xs font-mono font-medium text-[var(--color-heading)]">
            <span className="text-emerald-500 font-semibold">{org.remaining_minutes.toFixed(1)}</span> / {org.total_credits_minutes} min
          </div>
          <div className="w-24 h-1.5 rounded-full bg-[var(--color-surface-muted)] overflow-hidden mt-1 border border-[var(--color-border)]">
            <div
              className={`h-full ${
                org.status === 'exhausted' || org.status === 'critical'
                  ? 'bg-rose-500'
                  : org.status === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, org.usage_percentage))}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (org) => (
        <div className="flex items-center gap-1.5">
          {org.status === 'exhausted' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500">
              <XCircle className="w-3 h-3" /> Exhausted
            </span>
          ) : org.status === 'critical' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 animate-pulse">
              <AlertTriangle className="w-3 h-3" /> &lt;5% Left
            </span>
          ) : org.status === 'warning' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
              <AlertTriangle className="w-3 h-3" /> Low
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
              <CheckCircle2 className="w-3 h-3" /> Healthy
            </span>
          )}
          {!org.is_credit_enforced && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-slate-500/10 text-slate-400 font-mono">
              no-block
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'total_agents',
      header: 'Resources (Agents / Camps / Calls)',
      render: (org) => (
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-heading)]">
          <span title="Agents created">
            {org.total_agents}
            <span className="text-[10px] text-[var(--color-muted)] font-sans"> agt</span>
          </span>
          <span className="text-[var(--color-muted)]">/</span>
          <span title="Campaigns created">
            {org.total_campaigns}
            <span className="text-[10px] text-[var(--color-muted)] font-sans"> cmp</span>
          </span>
          <span className="text-[var(--color-muted)]">/</span>
          <span title="Total calls">
            {org.total_calls}
            <span className="text-[10px] text-[var(--color-muted)] font-sans"> cls</span>
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (org) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="primary"
            size="sm"
            onClick={() => openTopUpModal(org)}
            className="h-7 px-2 text-xs"
            leftIcon={<PlusCircle className="w-3 h-3" />}
          >
            Top-Up
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openAssignModal(org)}
            className="h-7 px-2 text-xs"
            title="Configure Plan & Quotas"
          >
            <Settings className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDeductModal(org)}
            className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10"
            title="Deduct Minutes"
          >
            <MinusCircle className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openAuditLogs(org)}
            className="h-7 px-2 text-xs"
            title="Audit History"
          >
            <History className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Platform Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Platform Allocated Credits</span>
          <div className="text-xl font-semibold font-mono text-[var(--color-heading)] mt-1">
            {totalAllocatedMinutes.toLocaleString()} min
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Consumed Minutes</span>
          <div className="text-xl font-semibold font-mono text-blue-500 mt-1">
            {totalUsedMinutes.toFixed(1)} min
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Organizations Near Limit</span>
          <div className="text-xl font-semibold font-mono text-amber-500 mt-1">
            {orgsInWarning}
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Exhausted (Calls Blocked)</span>
          <div className="text-xl font-semibold font-mono text-rose-500 mt-1">
            {orgsExhausted}
          </div>
        </div>
      </div>

      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert type="success" onDismiss={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {/* Directory Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-semibold text-[var(--color-heading)]">Organization Subscriptions & Credit Directory</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={orgCredits}
          isLoading={loading}
          loadingMessage="Loading organization subscriptions..."
          searchKey="org_name"
          searchPlaceholder="Search organizations by name or ID..."
          emptyTitle="No tenant organizations provisioned"
          emptyDescription="Create a tenant organization to assign credit quotas."
          pagination={true}
          pageSize={10}
        />
      </div>

      {/* Modal 1: Assign Plan & Quotas */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={`Configure Plan & Quotas — ${selectedOrg?.org_name}`}
        description="Assign subscription minutes, agent/campaign quotas, and call-blocking rules."
        maxWidth="md"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-heading)] mb-1">Plan Tier</label>
              <select
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="w-full h-8 text-xs px-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)]"
              >
                <option value="Starter">Starter (e.g. 100 min)</option>
                <option value="Standard">Standard (e.g. 300 min)</option>
                <option value="Professional">Professional (e.g. 500 min)</option>
                <option value="Enterprise">Enterprise (e.g. 1500 min)</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
            <Input
              label="Total Minutes Allocated"
              type="number"
              required
              min={0}
              value={totalMinutes}
              onChange={(e) => setTotalMinutes(Number(e.target.value))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Max Agents Allowed"
              type="number"
              placeholder="Leave empty for unlimited"
              value={maxAgents}
              onChange={(e) => setMaxAgents(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <Input
              label="Max Campaigns Allowed"
              type="number"
              placeholder="Leave empty for unlimited"
              value={maxCampaigns}
              onChange={(e) => setMaxCampaigns(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)] space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isEnforced}
                onChange={(e) => setIsEnforced(e.target.checked)}
                className="rounded border-[var(--color-border)]"
              />
              <span className="font-medium text-[var(--color-heading)]">Enforce Call Credit Limit</span>
            </label>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-[var(--color-muted)] mb-1">Action on 0 Balance</label>
                <select
                  value={exhaustedAction}
                  onChange={(e) => setExhaustedAction(e.target.value as any)}
                  className="w-full h-7 text-xs px-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)]"
                >
                  <option value="block">Block Calls (Strict)</option>
                  <option value="warn_only">Warn Only (Allow Overage)</option>
                </select>
              </div>
              <Input
                label="Low Warning % (Threshold)"
                type="number"
                min={5}
                max={50}
                value={lowThresholdPct}
                onChange={(e) => setLowThresholdPct(Number(e.target.value))}
              />
            </div>
          </div>

          <Input
            label="Reason / Notes"
            type="text"
            placeholder="e.g. Upgraded to Professional Plan"
            value={assignReason}
            onChange={(e) => setAssignReason(e.target.value)}
          />

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={submittingAssign}>
              Save Plan & Quotas
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Quick Top-Up */}
      <Modal
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
        title={`Top-Up Minutes — ${selectedOrg?.org_name}`}
        description="Add instant prepaid minute credits to the organization's pool."
        maxWidth="sm"
      >
        <form onSubmit={handleTopUpSubmit} className="space-y-4 text-xs">
          <div className="flex gap-2">
            {[30, 60, 120, 300].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setTopUpMinutes(mins)}
                className={`flex-1 py-1.5 rounded-lg border font-mono text-xs font-semibold transition-colors ${
                  topUpMinutes === mins
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-heading)]'
                }`}
              >
                +{mins}m
              </button>
            ))}
          </div>

          <Input
            label="Custom Minutes"
            type="number"
            min={1}
            required
            value={topUpMinutes}
            onChange={(e) => setTopUpMinutes(Number(e.target.value))}
          />

          <Input
            label="Reason Note"
            type="text"
            required
            value={topUpReason}
            onChange={(e) => setTopUpReason(e.target.value)}
          />

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowTopUpModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={submittingTopUp}>
              Add +{topUpMinutes} Minutes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Deduct Minutes */}
      <Modal
        isOpen={showDeductModal}
        onClose={() => setShowDeductModal(false)}
        title={`Deduct Minutes — ${selectedOrg?.org_name}`}
        description="Deduct credits only up to the organization's currently available remaining balance."
        maxWidth="sm"
      >
        <form onSubmit={handleDeductSubmit} className="space-y-4 text-xs">
          {/* Available Minutes Live Indicator */}
          <div className="p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border)] flex items-center justify-between">
            <div>
              <div className="text-[11px] text-[var(--color-muted)] font-medium">Available to Deduct</div>
              <div className="text-base font-mono font-bold text-emerald-500">
                {selectedOrg ? selectedOrg.remaining_minutes.toFixed(1) : '0.0'}{' '}
                <span className="text-xs font-normal text-[var(--color-muted)]">minutes</span>
              </div>
            </div>
            <div className="text-right border-l border-[var(--color-border)] pl-4">
              <div className="text-[11px] text-[var(--color-muted)] font-medium">Total Pool</div>
              <div className="text-xs font-mono font-semibold text-[var(--color-heading)]">
                {selectedOrg?.total_credits_minutes || 0} min
              </div>
            </div>
          </div>

          {selectedOrg && selectedOrg.remaining_minutes <= 0 ? (
            <Alert type="warning" className="text-xs">
              This organization has 0 remaining minutes. No credits can be deducted.
            </Alert>
          ) : (
            <>
              {/* Quick Preset Buttons */}
              {selectedOrg && selectedOrg.remaining_minutes > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] text-[var(--color-muted)] font-medium">Quick Presets:</span>
                  <div className="flex gap-2">
                    {[
                      { label: '25%', value: Math.max(1, Math.round(selectedOrg.remaining_minutes * 0.25)) },
                      { label: '50%', value: Math.max(1, Math.round(selectedOrg.remaining_minutes * 0.50)) },
                      { label: 'Max', value: Math.floor(selectedOrg.remaining_minutes) },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setDeductMinutes(preset.value)}
                        className={`flex-1 py-1 rounded border text-xs font-mono font-medium transition-colors ${
                          deductMinutes === preset.value
                            ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-semibold'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-heading)] hover:border-amber-500/50'
                        }`}
                      >
                        {preset.label} ({preset.value}m)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Input
                  label={`Minutes to Deduct (Max: ${selectedOrg ? Math.floor(selectedOrg.remaining_minutes) : 0})`}
                  type="number"
                  min={1}
                  max={selectedOrg ? Math.max(1, Math.floor(selectedOrg.remaining_minutes)) : 1}
                  required
                  value={deductMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const maxAllowed = selectedOrg ? Math.floor(selectedOrg.remaining_minutes) : val;
                    if (val > maxAllowed) {
                      setDeductMinutes(maxAllowed);
                    } else {
                      setDeductMinutes(val);
                    }
                  }}
                  disabled={!selectedOrg || selectedOrg.remaining_minutes <= 0}
                />
                {selectedOrg && deductMinutes > selectedOrg.remaining_minutes && (
                  <p className="mt-1 text-[11px] text-rose-500 font-medium">
                    Cannot enter more than {selectedOrg.remaining_minutes.toFixed(1)} available minutes.
                  </p>
                )}
              </div>

              <Input
                label="Reason Note"
                type="text"
                required
                placeholder="e.g. Administrative refund / billing correction"
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                disabled={!selectedOrg || selectedOrg.remaining_minutes <= 0}
              />
            </>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowDeductModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={submittingDeduct}
              disabled={
                submittingDeduct ||
                !selectedOrg ||
                selectedOrg.remaining_minutes <= 0 ||
                deductMinutes <= 0 ||
                deductMinutes > selectedOrg.remaining_minutes
              }
            >
              Deduct -{deductMinutes} Minutes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 4: Audit Logs */}
      <Modal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        title={`Audit Trail — ${selectedOrg?.org_name}`}
        description="Log of all plan configurations, top-ups, and adjustments."
        maxWidth="md"
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {loadingAudit ? (
            <p className="text-xs text-[var(--color-muted)] text-center py-6">Loading audit trail...</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] text-center py-6">No audit records found.</p>
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
                      <span className="text-[10px] text-[var(--color-muted)]">
                        (Total: {log.new_total_minutes}m)
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
