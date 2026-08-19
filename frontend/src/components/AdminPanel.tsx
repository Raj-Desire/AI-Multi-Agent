import React, { useState, useEffect } from "react";
import { UserSummary } from "../types";
import { fetchApi } from "../api-client";
import { useAuth } from "../context/AuthContext";
import {
  UserPlus,
  Key,
  Trash2,
  RefreshCw,
  User,
  Mail,
  Lock,
} from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Modal } from "./ui/Modal";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { StatusIndicator } from "./ui/StatusIndicator";
import { DataTable, Column } from "./ui/DataTable";

export const AdminPanel: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite member modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password reset modal states
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Delete user confirmation modal state
  const [userToDelete, setUserToDelete] = useState<UserSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await fetchApi<UserSummary[]>("/admin/users");
      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load team members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await fetchApi<UserSummary>("/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, email, password, role }),
      });

      setSuccessMsg(`User '${username}' created successfully.`);
      setInviteModalOpen(false);
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsResetting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await fetchApi(`/admin/users/${selectedUser.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ new_password: newPassword }),
      });

      setSuccessMsg(`Password for '${selectedUser.username}' updated successfully.`);
      setSelectedUser(null);
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setIsResetting(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    if (userToDelete.role === "admin" || userToDelete.role === "superadmin") {
      setError("Admin accounts cannot be deleted directly.");
      setUserToDelete(null);
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await fetchApi(`/admin/users/${userToDelete.id}`, { method: "DELETE" });
      setSuccessMsg(`User ${userToDelete.email} removed from the workspace.`);
      setUserToDelete(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to delete user.");
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<UserSummary>[] = [
    {
      key: "username",
      header: "Member",
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center text-xs font-semibold uppercase shrink-0">
            {u.username ? u.username.charAt(0) : "U"}
          </div>
          <div>
            <div className="font-medium text-xs text-[var(--color-heading)] leading-none">{u.username}</div>
            <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (u) => (
        <Badge
          variant={u.role === "admin" ? "primary" : "default"}
          size="sm"
        >
          {u.role}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: () => <StatusIndicator status="active" label="Active" />,
    },
    {
      key: "created_at",
      header: "Joined",
      sortable: true,
      render: (u) => (
        <span className="text-xs text-[var(--color-muted)]">
          {u.created_at ? new Date(u.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—"}
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
          {u.role !== "admin" && u.role !== "superadmin" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUserToDelete(u)}
              className="h-7 px-2 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
              title="Remove Member"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const adminCount = users.filter((u) => u.role === "admin" || u.role === "superadmin").length;
  const memberCount = users.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Team & Access Control"
        description="Manage workspace team members, invite staff, and administer permissions."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadUsers}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setInviteModalOpen(true)}
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            >
              Invite Member
            </Button>
          </div>
        }
      />

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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs space-y-1">
          <span className="text-xs text-[var(--color-muted)] font-medium">Total Workspace Members</span>
          <div className="text-2xl font-bold text-[var(--color-heading)]">{memberCount}</div>
        </div>
        <div className="p-4 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs space-y-1">
          <span className="text-xs text-[var(--color-muted)] font-medium">Administrators</span>
          <div className="text-2xl font-bold text-[var(--color-heading)]">{adminCount}</div>
        </div>
      </div>

      {/* Users DataTable */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-heading)]">Organization Members</h3>
          <span className="text-xs text-[var(--color-muted)]">{users.length} members total</span>
        </div>

        <DataTable
          columns={columns}
          data={users}
          isLoading={loading}
          loadingMessage="Loading team members..."
          searchKey="username"
          searchPlaceholder="Search members by username or email..."
          emptyTitle="No team members yet"
          emptyDescription="Click 'Invite Member' above to grant access to your workspace."
          pagination={true}
          pageSize={10}
        />
      </div>

      {/* Invite Member Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite New Team Member"
        description="Create an account for a new colleague to join your organization."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. janesmith"
            leftIcon={<User className="w-4 h-4" />}
          />
          <Input
            label="Email Address"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            leftIcon={<Mail className="w-4 h-4" />}
          />
          <Input
            label="Initial Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
          />
          <div>
            <label className="block text-xs font-medium text-[var(--color-heading)] mb-1.5">
              Access Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "user" | "admin")}
              className="w-full h-9 text-xs px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none"
            >
              <option value="user">User (Standard Calling & Agent Access)</option>
              <option value="admin">Admin (Full Organization & Settings Access)</option>
            </select>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
            >
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Password Reset Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Reset Password"
        description={`Set a new login password for ${selectedUser?.username || "member"}.`}
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

      {/* Delete User Confirmation Modal */}
      <Modal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="Remove Team Member"
        description="Are you sure you want to remove this user from the workspace?"
        maxWidth="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setUserToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={confirmDeleteUser}
            >
              Remove Member
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--color-heading)] truncate">
                {userToDelete?.username}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] truncate">
                {userToDelete?.email} • <span className="capitalize">{userToDelete?.role}</span>
              </p>
            </div>
          </div>
          <p className="text-[var(--color-muted)] leading-relaxed">
            This action will permanently revoke workspace access for <strong>{userToDelete?.email}</strong>.
          </p>
        </div>
      </Modal>
    </div>
  );
};
