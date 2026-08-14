import React, { useState, useEffect } from "react";
import { UserSummary, OrganizationSummary, PlatformOverviewMetrics } from "../types";
import { fetchApi } from "../api-client";
import {
  ShieldAlert,
  Building2,
  Users,
  UserCheck,
  UserPlus,
  Key,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  PlusCircle,
  Mail,
  Lock,
  User,
  Shield,
  Layers,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "./ui/Table";
import { Modal } from "./ui/Modal";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";

export const SuperAdminPanel: React.FC = () => {
  const [overview, setOverview] = useState<PlatformOverviewMetrics | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>("all");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Create Organization + Admin modal
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Create additional admin for existing org
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

      setSuccessMsg(`Organization '${orgName}' & Admin account '${res.email}' created successfully!`);
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

      setSuccessMsg(`New Admin '${res.username}' assigned to '${targetOrgName}' successfully!`);
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

  const handleResetPassword = async (e: React.FormEvent) => {
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

      setSuccessMsg(`Password for ${selectedUser.username} (${selectedUser.email}) updated.`);
      setSelectedUser(null);
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleToggleOrgStatus = async (org: OrganizationSummary) => {
    if (org.organization_id === "org_platform_root") {
      alert("Platform Master root organization cannot be disabled.");
      return;
    }

    const nextState = !org.is_active;
    const actionLabel = nextState ? "enable" : "disable";
    if (!window.confirm(`Are you sure you want to ${actionLabel} organization '${org.org_name}'? ${nextState ? "Users will be allowed to log in." : "All users in this organization will be blocked from logging in."}`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetchApi<{ message: string; is_active: boolean }>(
        `/superadmin/organizations/${org.organization_id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: nextState }),
        }
      );
      setSuccessMsg(res.message);
      await loadData();
    } catch (err: any) {
      setError(err.message || `Failed to ${actionLabel} organization.`);
    }
  };

  const handleDeleteOrganization = async (org: OrganizationSummary) => {
    if (org.organization_id === "org_platform_root") {
      alert("Platform Master root organization cannot be deleted.");
      return;
    }

    if (!window.confirm(`⚠️ PERMANENT DELETION: Are you sure you want to completely delete organization '${org.org_name}' and ALL ${org.total_members} user/admin accounts? This action cannot be undone.`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetchApi<{ message: string }>(
        `/superadmin/organizations/${org.organization_id}`,
        { method: "DELETE" }
      );
      setSuccessMsg(res.message);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete organization.");
    }
  };

  const handleDeleteUser = async (user: UserSummary) => {
    if (user.role === "superadmin") {
      alert("Superadmin master accounts are protected and cannot be deleted via quick action.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete user ${user.email} (${user.org_name || user.organization_id})?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      await fetchApi(`/superadmin/users/${user.id}`, { method: "DELETE" });
      setSuccessMsg(`User ${user.email} deleted successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete user.");
    }
  };


  // Filtered user list
  const filteredUsers = users.filter((u) => {
    const matchesOrg = selectedOrgFilter === "all" || u.organization_id === selectedOrgFilter;
    const matchesRole = selectedRoleFilter === "all" || u.role === selectedRoleFilter;
    const matchesSearch =
      searchQuery === "" ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.org_name && u.org_name.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesOrg && matchesRole && matchesSearch;
  });

  return (
    <div className="w-full space-y-6">
      {/* Top Page Header */}
      <PageHeader
        title="Super Admin Master Console"
        description="Global platform oversight: Provision client organizations, assign organization administrators, and manage users across all tenant silos."
        badge={
          <Badge variant="primary" size="md">
            Superadmin Root
          </Badge>
        }
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowOrgModal(true)}
              leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
            >
              New Organization
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync Platform
            </Button>
          </div>
        }
      />

      {/* Global Alerts */}
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

      {/* Platform Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border border-slate-200">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Client Orgs</div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {overview?.total_organizations ?? 0}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-slate-200">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-2xs">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Org Admins</div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {overview?.total_admins ?? 0}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-slate-200">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Client Users</div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {overview?.total_users ?? 0}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-slate-200">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-2xs">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Accounts</div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {overview?.total_accounts ?? 0}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organizations Directory */}
      <Card className="bg-white border border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 theme-primary-text" />
              <CardTitle className="text-sm">Organizations Directory ({organizations.length})</CardTitle>
            </div>
            <CardDescription>Multi-tenant organization partitions and their primary administrators.</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowOrgModal(true)}
            leftIcon={<Building2 className="w-3 h-3" />}
          >
            Provision Org
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading organizations...</div>
          ) : organizations.length === 0 ? (
            <TableEmpty message="No client organizations provisioned yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization Name</TableHead>
                  <TableHead>Org ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admins</TableHead>
                  <TableHead>Client Users</TableHead>
                  <TableHead>Total Members</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => (
                  <TableRow key={org.organization_id} className={!org.is_active ? "bg-slate-50/80 opacity-80" : ""}>
                    <TableCell className="font-bold text-heading">
                      <div className="flex items-center gap-2">
                        <span>{org.org_name}</span>
                        {org.organization_id === "org_platform_root" && (
                          <Badge variant="primary" size="sm">Master</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {org.organization_id}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.is_active ? "success" : "danger"} size="sm" dot>
                        {org.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {org.admins.length > 0 ? (
                          org.admins.map((adm) => (
                            <span key={adm.id} className="text-xs font-mono text-slate-700">
                              {adm.username} ({adm.email})
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No admin assigned</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" size="sm">
                        {org.user_count} Users
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold font-mono text-xs">{org.total_members}</span>
                    </TableCell>
                    <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                      {org.organization_id !== "org_platform_root" && (
                        <Button
                          variant={org.is_active ? "outline" : "primary"}
                          size="sm"
                          onClick={() => handleToggleOrgStatus(org)}
                          className={org.is_active ? "text-amber-700 hover:bg-amber-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                        >
                          {org.is_active ? "Disable Org" : "Enable Org"}
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTargetOrgId(org.organization_id);
                          setTargetOrgName(org.org_name);
                          setShowAdminModal(true);
                        }}
                        leftIcon={<UserPlus className="w-3 h-3" />}
                      >
                        Add Admin
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedOrgFilter(org.organization_id)}
                      >
                        View Users
                      </Button>

                      {org.organization_id !== "org_platform_root" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOrganization(org)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          leftIcon={<Trash2 className="w-3 h-3" />}
                          title="Delete Organization"
                        >
                          Delete Org
                        </Button>
                      )}
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>

            </Table>
          )}
        </CardContent>
      </Card>

      {/* Global Master Users Directory */}
      <Card className="bg-white border border-slate-200">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 theme-primary-text" />
              <CardTitle className="text-sm">Global Users Master Directory ({filteredUsers.length})</CardTitle>
            </div>
            <CardDescription>Complete visibility of all administrators and users across all organizations.</CardDescription>
          </div>

          {/* Search and Filters Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user or email..."
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Org Filter */}
            <select
              value={selectedOrgFilter}
              onChange={(e) => setSelectedOrgFilter(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold focus:outline-none"
            >
              <option value="all">All Organizations</option>
              {organizations.map((org) => (
                <option key={org.organization_id} value={org.organization_id}>
                  {org.org_name}
                </option>
              ))}
            </select>

            {/* Role Filter */}
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="admin">Admin</option>
              <option value="user">Standard User</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading user records...</div>
          ) : filteredUsers.length === 0 ? (
            <TableEmpty message="No matching users found." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-bold text-heading">
                      <div className="flex items-center gap-2">
                        <span>{u.username}</span>
                        {u.role === "superadmin" && (
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{u.email}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <span className="font-semibold text-slate-800">{u.org_name || "Default Org"}</span>
                        <span className="block font-mono text-[10px] text-slate-400">{u.organization_id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          u.role === "superadmin"
                            ? "primary"
                            : u.role === "admin"
                            ? "warning"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "success" : "danger"} size="sm" dot>
                        {u.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(u);
                          setNewPassword("");
                        }}
                        leftIcon={<Key className="w-3 h-3" />}
                      >
                        Password
                      </Button>

                      {u.role !== "superadmin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUser(u)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          leftIcon={<Trash2 className="w-3 h-3" />}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal: Provision New Organization + Admin */}
      <Modal
        isOpen={showOrgModal}
        onClose={() => setShowOrgModal(false)}
        title="Provision New Client Organization"
        description="Creates an isolated tenant partition in Azure Cosmos DB and assigns its initial organization administrator."
      >
        <form onSubmit={handleCreateOrganization} className="space-y-4">
          <Input
            label="Organization Name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Acme Corp or Stellar Healthcare"
            leftIcon={<Building2 className="w-4 h-4" />}
            required
          />

          <div className="border-t border-slate-100 pt-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Primary Organization Admin Details
            </span>
            <div className="space-y-3">
              <Input
                label="Admin Username"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                placeholder="e.g. Acme Admin"
                leftIcon={<User className="w-4 h-4" />}
                required
              />

              <Input
                label="Admin Email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@acmecorp.com"
                leftIcon={<Mail className="w-4 h-4" />}
                required
              />

              <Input
                label="Admin Password"
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Min 6 characters"
                leftIcon={<Lock className="w-4 h-4" />}
                className="font-mono"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
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

      {/* Modal: Assign Additional Admin to Organization */}
      <Modal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        title={`Assign Admin to ${targetOrgName}`}
        description="Creates an additional Organization Administrator account with full rights over this tenant's users."
      >
        <form onSubmit={handleCreateExtraAdmin} className="space-y-4">
          <Input
            label="Admin Username"
            value={extraAdminUser}
            onChange={(e) => setExtraAdminUser(e.target.value)}
            placeholder="e.g. Operations Admin"
            leftIcon={<User className="w-4 h-4" />}
            required
          />

          <Input
            label="Admin Email"
            type="email"
            value={extraAdminEmail}
            onChange={(e) => setExtraAdminEmail(e.target.value)}
            placeholder="ops@acmecorp.com"
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />

          <Input
            label="Admin Password"
            type="text"
            value={extraAdminPass}
            onChange={(e) => setExtraAdminPass(e.target.value)}
            placeholder="Min 6 characters"
            leftIcon={<Lock className="w-4 h-4" />}
            className="font-mono"
            required
          />

          <div className="flex items-center justify-end gap-3 pt-3">
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
              Assign Admin
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Superadmin Reset Password */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Superadmin Credential Override"
        description={
          selectedUser
            ? `Setting new password for ${selectedUser.username} (${selectedUser.email}) [Org: ${selectedUser.org_name || selectedUser.organization_id}]`
            : undefined
        }
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            label="New Password"
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min 6 chars)"
            minLength={6}
            leftIcon={<Lock className="w-4 h-4" />}
            className="font-mono"
            required
          />

          <div className="flex items-center justify-end gap-3 pt-3">
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
              Override Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
