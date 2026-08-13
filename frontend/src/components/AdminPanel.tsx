import React, { useState, useEffect } from "react";
import { UserSummary } from "../types";
import { fetchApi } from "../api-client";

export const AdminPanel: React.FC = () => {
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

      setSuccessMsg(`User '${newUser.username}' (${newUser.email}) created successfully!`);
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
    if (user.role === "admin") {
      alert("Primary Admin account is protected and cannot be deleted. At least one Admin must always exist.");
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
    <div className="space-y-8 max-w-6xl mx-auto py-6 px-4 font-sans">
      {/* Page Title */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Admin User Management</h1>
        <p className="text-sm text-slate-500 mt-1">
          Provision tenant accounts for clients, change user passwords, and manage access in Azure Cosmos DB.
        </p>
      </div>

      {/* Policy Banner */}
      <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-100 flex items-start gap-3 text-indigo-900 text-sm">
        <svg className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div>
          <span className="font-semibold">Platform Security Policy:</span> You are the Master Admin. You can provision client accounts and change the password of any user account at any time.
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-500 font-semibold hover:text-rose-700">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 font-semibold hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* Grid: Create User Form + User List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Create User Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 lg:col-span-1">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Provision Client Account
          </h2>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assign Initial Password</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password for client"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account Role</label>
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-sm font-medium flex items-center justify-between">
                <span>Standard User (Client)</span>
                <span className="text-[10px] uppercase font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">Fixed</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Provisioning Client..." : "Create Client Account"}
            </button>
          </form>
        </div>

        {/* Right Column: Users List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Registered Accounts ({users.length})</h2>
            <button
              onClick={loadUsers}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading users from Cosmos DB...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-900">{u.username}</td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">{u.email}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.role === "admin"
                              ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {/* Change Password Button */}
                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setNewPassword("");
                          }}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                        >
                          Change Password
                        </button>

                        {u.role === "admin" ? (
                          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                            Protected Admin
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="text-rose-600 hover:text-rose-800 text-xs font-medium p-1 hover:bg-rose-50 rounded-md transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Change Password
              </h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="text-sm text-slate-600">
              Updating password for account <span className="font-semibold text-slate-900">{selectedUser.username}</span> (<span className="font-mono text-xs text-indigo-600">{selectedUser.email}</span>).
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 chars)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-mono"
                  minLength={6}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                >
                  {isResetting ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
