import React, { useState, useEffect } from "react";
import { UserSummary } from "../types";
import { fetchApi } from "../api-client";
import { useAuth } from "../context/AuthContext";
import {
  ShieldCheck,
  UserPlus,
  Key,
  Trash2,
  RefreshCw,
  User,
  Mail,
  Lock,
  Building2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "./ui/Table";
import { Modal } from "./ui/Modal";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";

export const AdminPanel: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for user creation
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password reset modal states
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await fetchApi<UserSummary[]>("/admin/users");
      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load user list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const newUser = await fetchApi<UserSummary>("/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, email, password, role: "user" }),
      });

      setSuccessMsg(`User '${newUser.username}' (${newUser.email}) created successfully for ${currentUser?.org_name || "your organization"}!`);
      setUsername("");
      setEmail("");
      setPassword("");
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;

    setError(null);
    setSuccessMsg(null);
    setIsResetting(true);

    try {
      await fetchApi<{ message: string }>(`/admin/users/${selectedUser.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ new_password: newPassword }),
      });

      setSuccessMsg(`Password for user '${selectedUser.username}' (${selectedUser.email}) updated successfully.`);
      setSelectedUser(null);
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async (user: UserSummary) => {
    if (user.role === "admin" || user.role === "superadmin") {
      alert("Admin accounts cannot be deleted from the Organization User tab.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete user ${user.email}?`)) {
      return;
    }
    setError(null);
    setSuccessMsg(null);

    try {
      await fetchApi(`/admin/users/${user.id}`, { method: "DELETE" });
      setSuccessMsg(`User ${user.email} deleted successfully.`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to delete user.");
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Organization User Management"
        description={`Provision and manage client accounts belonging strictly to ${currentUser?.org_name || "your organization"}.`}
        badge={
          <div className="flex items-center gap-2">
            <Badge variant="primary" size="md">
              <Building2 className="w-3.5 h-3.5 mr-1" />
              {currentUser?.org_name || "Organization Admin"}
            </Badge>
          </div>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadUsers}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh Accounts
          </Button>
        }
      />

      {/* Policy Alert */}
      <Alert type="info">
        <span className="font-bold text-sky-950">Tenant Isolation Policy:</span> You are managing users under{" "}
        <span className="font-bold">{currentUser?.org_name || "your organization"}</span> ({currentUser?.organization_id}).
      </Alert>


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

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Create User Form (5 cols on large screens) */}
        <Card className="lg:col-span-5 bg-white border border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 theme-primary-text" />
              <CardTitle className="text-sm">Provision Client Account</CardTitle>
            </div>
            <CardDescription>Create a new user under your organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <Input
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. John Doe"
                leftIcon={<User className="w-4 h-4" />}
                required
              />

              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                leftIcon={<Mail className="w-4 h-4" />}
                required
              />

              <Input
                label="Assign Initial Password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Initial password (min 6 chars)"
                leftIcon={<Lock className="w-4 h-4" />}
                className="font-mono"
                required
              />

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-sub mb-1.5">
                  Account Role
                </label>
                <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-semibold text-heading">
                  <span>Standard User (Client)</span>
                  <Badge variant="neutral" size="sm">Fixed</Badge>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                className="w-full mt-2"
              >
                Create Account
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Right Column: User Accounts Table (7 cols on large screens) */}
        <Card className="lg:col-span-7 bg-white border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Registered Accounts ({users.length})</CardTitle>
              <CardDescription>Active organization members with platform access.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-12 text-center text-xs text-sub">
                Loading users from Azure Cosmos DB...
              </div>
            ) : users.length === 0 ? (
              <TableEmpty message="No registered users found." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-bold text-heading">
                        {u.username}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-body">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "primary" : "neutral"} size="sm">
                          {u.role}
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

                        {u.role === "admin" ? (
                          <Badge variant="neutral" size="sm">
                            Protected
                          </Badge>
                        ) : (
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
      </div>

      {/* Change Password Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Change User Password"
        description={
          selectedUser
            ? `Updating credentials for ${selectedUser.username} (${selectedUser.email})`
            : undefined
        }
      >
        <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
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
              Update Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
