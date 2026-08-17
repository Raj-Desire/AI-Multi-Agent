import React, { useState, useEffect } from "react";
import { UserSummary, OrganizationSummary, PlatformOverviewMetrics } from "../types";
import { fetchApi } from "../api-client";
import {
  Building2,
  Users,
  UserPlus,
  Key,
  Trash2,
  RefreshCw,
  PlusCircle,
  Mail,
  Lock,
  User,
  Shield,
  Layers,
} from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Modal } from "./ui/Modal";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { StatusIndicator } from "./ui/StatusIndicator";
import { DataTable, Column } from "./ui/DataTable";
import { Tabs } from "./ui/Tabs";

export const SuperAdminPanel: React.FC = () => {
  const [overview, setOverview] = useState<PlatformOverviewMetrics | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("organizations");

  // Filters
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>("all");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");

  // Create Organization modal
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Create Admin modal
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [targetOrgId, setTargetOrgId] = useState("");
  const [targetOrgName, setTargetOrgName] = useState("");
  const [extraAdminUser, setExtraAdminUser] = useState("");
  const [extraAdminEmail, setExtraAdminEmail] = useState("");
  const [extraAdminPass, setExtraAdminPass] = useState("");
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  // Reset password modal
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, orgsData, usersData] = await Promise.all([
        fetchApi<PlatformOverviewMetrics>("/superadmin/overview"),
        fetchApi<OrganizationSummary[]>("/superadmin/organizations"),
        fetchApi<UserSummary[]>("/superadmin/users"),
      ]);
      setOverview(overviewData);
      setOrganizations(orgsData);
      setUsers(usersData);
    } catch (err: any) {
      setError(err.message || "Failed to load superadmin telemetry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsCreatingOrg(true);

    try {
      const res = await fetchApi<UserSummary>("/superadmin/organizations", {
        method: "POST",
        body: JSON.stringify({
          org_name: orgName,
          admin_username: adminUsername,
          admin_email: adminEmail,
          admin_password: adminPassword,
        }),
      });

      setSuccessMsg(`Organization '${orgName}' & Admin '${res.email}' provisioned successfully.`);
      setShowOrgModal(false);
      setOrgName("");
      setAdminUsername("");
      setAdminEmail("");
      setAdminPassword("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to provision organization.");
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleCreateExtraAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetOrgId) return;

    setError(null);
    setSuccessMsg(null);
    setIsCreatingAdmin(true);

    try {
      const res = await fetchApi<UserSummary>("/superadmin/admins", {
        method: "POST",
        body: JSON.stringify({
          username: extraAdminUser,
          email: extraAdminEmail,
          password: extraAdminPass,
          organization_id: targetOrgId,
          org_name: targetOrgName,
        }),
      });

      setSuccessMsg(`Admin '${res.username}' assigned to '${targetOrgName}'.`);
      setShowAdminModal(false);
      setExtraAdminUser("");
      setExtraAdminEmail("");
      setExtraAdminPass("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to assign admin.");
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;

    setError(null);
    setSuccessMsg(null);
    setIsResetting(true);

    try {
      await fetchApi<{ message: string }>(`/superadmin/users/${selectedUser.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ new_password: newPassword }),
      });

      setSuccessMsg(`Password for '${selectedUser.email}' updated.`);
      setSelectedUser(null);
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async (user: UserSummary) => {
    if (!window.confirm(`Delete user '${user.email}' from ${user.org_name || user.organization_id}?`)) {
      return;
    }
    setError(null);
    setSuccessMsg(null);

    try {
      await fetchApi(`/superadmin/users/${user.id}`, { method: "DELETE" });
      setSuccessMsg(`User '${user.email}' deleted.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete user.");
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchOrg = selectedOrgFilter === "all" || u.organization_id === selectedOrgFilter;
    const matchRole = selectedRoleFilter === "all" || u.role === selectedRoleFilter;
    return matchOrg && matchRole;
  });

  const orgColumns: Column<OrganizationSummary>[] = [
    {
      key: "org_name",
      header: "Organization",
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
      key: "admin_count",
      header: "Admins",
      sortable: true,
      render: (org) => (
        <span className="font-mono text-xs text-[var(--color-heading)]">{org.admin_count}</span>
      ),
    },
    {
      key: "user_count",
      header: "Total Members",
      sortable: true,
      render: (org) => (
        <span className="font-mono text-xs text-[var(--color-heading)]">{org.user_count}</span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (org) => (
        <StatusIndicator
          status={org.is_active ? "active" : "idle"}
          label={org.is_active ? "Active" : "Suspended"}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (org) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTargetOrgId(org.organization_id);
            setTargetOrgName(org.org_name);
            setShowAdminModal(true);
          }}
          className="h-7 px-2 text-xs"
        >
          Add Admin
        </Button>
      ),
    },
  ];

  const userColumns: Column<UserSummary>[] = [
    {
      key: "username",
      header: "User",
      sortable: true,
      render: (u) => (
        <div>
          <div className="font-medium text-xs text-[var(--color-heading)]">{u.username}</div>
          <div className="text-[11px] text-[var(--color-muted)]">{u.email}</div>
        </div>
      ),
    },
    {
      key: "org_name",
      header: "Tenant Organization",
      sortable: true,
      render: (u) => (
        <span className="text-xs text-[var(--color-heading)] font-medium">
          {u.org_name || u.organization_id}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (u) => (
        <Badge
          variant={u.role === "superadmin" ? "warning" : u.role === "admin" ? "primary" : "default"}
          size="sm"
        >
          {u.role}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (u) => (
        <span className="text-xs text-[var(--color-muted)]">
          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (u) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedUser(u)}
            className="h-7 px-2 text-xs"
            title="Reset Password"
          >
            <Key className="w-3.5 h-3.5" />
          </Button>
          {u.role !== "superadmin" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteUser(u)}
              className="h-7 px-2 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
              title="Delete Account"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Master Console"
        description="Multi-tenant tenant governance, root organization provisioning, and global accounts."
        badge={<Badge variant="warning" size="sm">SuperAdmin Root</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync Telemetry
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowOrgModal(true)}
              leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
            >
              Provision Org
            </Button>
          </div>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Organizations</span>
          <div className="text-xl font-semibold text-[var(--color-heading)] mt-1 font-mono">{overview?.total_organizations || organizations.length}</div>
        </div>
        <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Total Accounts</span>
          <div className="text-xl font-semibold text-[var(--color-heading)] mt-1 font-mono">{overview?.total_users || users.length}</div>
        </div>
        <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Tenant Admins</span>
          <div className="text-xl font-semibold text-[var(--color-heading)] mt-1 font-mono">{overview?.total_admins || 0}</div>
        </div>
        <div className="p-3.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <span className="text-xs text-[var(--color-muted)] font-medium">Total Accounts</span>
          <div className="text-xl font-semibold text-[var(--color-heading)] mt-1 font-mono">{overview?.total_accounts || users.length}</div>
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

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "organizations", label: "Organizations Directory", icon: <Building2 className="w-3.5 h-3.5" /> },
          { id: "users", label: "Global User Accounts", icon: <Users className="w-3.5 h-3.5" /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      {/* TAB 1: Organizations Directory */}
      {activeTab === "organizations" && (
        <div className="space-y-3">
          <DataTable
            columns={orgColumns}
            data={organizations}
            searchKey="org_name"
            searchPlaceholder="Search organizations by name or ID..."
            emptyTitle="No organizations provisioned"
            emptyDescription="Create a tenant organization to isolate data, voice settings, and members."
            pagination={true}
            pageSize={10}
          />
        </div>
      )}

      {/* TAB 2: Global User Accounts */}
      {activeTab === "users" && (
        <div className="space-y-3">
          {/* Org & Role Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[var(--color-muted)]">Organization:</span>
              <select
                value={selectedOrgFilter}
                onChange={(e) => setSelectedOrgFilter(e.target.value)}
                className="h-8 text-xs px-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)] focus:outline-none"
              >
                <option value="all">All Organizations ({organizations.length})</option>
                {organizations.map((org) => (
                  <option key={org.organization_id} value={org.organization_id}>
                    {org.org_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[var(--color-muted)]">Role:</span>
              <select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                className="h-8 text-xs px-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-heading)] focus:outline-none"
              >
                <option value="all">All Roles</option>
                <option value="superadmin">SuperAdmin</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
            </div>
          </div>

          <DataTable
            columns={userColumns}
            data={filteredUsers}
            searchKey="username"
            searchPlaceholder="Search users across all tenants..."
            emptyTitle="No accounts match filter criteria"
            emptyDescription="Adjust your organization or role filters."
            pagination={true}
            pageSize={10}
          />
        </div>
      )}

      {/* Provision Organization Modal */}
      <Modal
        isOpen={showOrgModal}
        onClose={() => setShowOrgModal(false)}
        title="Provision Tenant Organization"
        description="Creates an isolated tenant organization and primary administrator account."
      >
        <form onSubmit={handleCreateOrganization} className="space-y-4">
          <Input
            label="Organization Brand Name"
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Acme Telecom AI"
            leftIcon={<Building2 className="w-4 h-4" />}
          />
          <Input
            label="Admin Full Name"
            type="text"
            required
            value={adminUsername}
            onChange={(e) => setAdminUsername(e.target.value)}
            placeholder="e.g. Sarah Jenkins"
            leftIcon={<User className="w-4 h-4" />}
          />
          <Input
            label="Admin Email Address"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@acmetelecom.com"
            leftIcon={<Mail className="w-4 h-4" />}
          />
          <Input
            label="Admin Password"
            type="password"
            required
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="••••••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
          />
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowOrgModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isCreatingOrg}
            >
              Provision Organization
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Extra Admin Modal */}
      <Modal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        title="Assign Organization Admin"
        description={`Add an administrator account to '${targetOrgName}'.`}
      >
        <form onSubmit={handleCreateExtraAdmin} className="space-y-4">
          <Input
            label="Admin Name"
            type="text"
            required
            value={extraAdminUser}
            onChange={(e) => setExtraAdminUser(e.target.value)}
            placeholder="e.g. John Doe"
            leftIcon={<User className="w-4 h-4" />}
          />
          <Input
            label="Work Email"
            type="email"
            required
            value={extraAdminEmail}
            onChange={(e) => setExtraAdminEmail(e.target.value)}
            placeholder="john@organization.com"
            leftIcon={<Mail className="w-4 h-4" />}
          />
          <Input
            label="Password"
            type="password"
            required
            value={extraAdminPass}
            onChange={(e) => setExtraAdminPass(e.target.value)}
            placeholder="••••••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
          />
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowAdminModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isCreatingAdmin}
            >
              Assign Administrator
            </Button>
          </div>
        </form>
      </Modal>

      {/* SuperAdmin Password Reset Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="SuperAdmin Password Override"
        description={`Set a new password for account: ${selectedUser?.email}.`}
      >
        <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
          <Input
            label="New Password"
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
          />
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setSelectedUser(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isResetting}
            >
              Update Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
