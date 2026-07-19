import React, { useEffect, useState } from "react";
import type {
  AccountApi,
  AccountProfile,
  AccountGroup,
  FeatureDefinition,
  AdminMetrics,
  AccountStatus,
} from "../../domain/account";
import { AdminAnalyticsPage } from "./AdminAnalyticsPage";
import { ScrollArea } from "../../components/ScrollArea";

export function AdminPage({ api }: { api: AccountApi }) {
  const [view, setView] = useState<"management" | "analytics">("management");
  const [users, setUsers] = useState<AccountProfile[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [features, setFeatures] = useState<FeatureDefinition[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, { success?: string; error?: string }>>({});

  // Forms
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newFeatureKey, setNewFeatureKey] = useState("");
  const [newFeatureDesc, setNewFeatureDesc] = useState("");

  const [assignFeatureKey, setAssignFeatureKey] = useState("");
  const [assignSubjectType, setAssignSubjectType] = useState<"user" | "group">("user");
  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [assignEnabled, setAssignEnabled] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 3 stale admin downgrade check
      let userList: AccountProfile[];
      try {
        userList = await api.adminListUsers();
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (errMsg.includes("admin_required") || errMsg.includes("adminRequired")) {
          await api.signOut();
          window.location.reload();
          return;
        }
        throw err;
      }

      const [groupList, featureList, metricSummary] = await Promise.all([
        api.adminListGroups(),
        api.adminListFeatures(),
        api.adminMetrics(),
      ]);

      setUsers(userList);
      setGroups(groupList);
      setFeatures(featureList);
      setMetrics(metricSummary);
    } catch (err: any) {
      setError(err?.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [api]);

  const updateRowStatus = (id: string, success?: string, error?: string) => {
    setRowStatus((prev) => ({
      ...prev,
      [id]: { success, error },
    }));
    setTimeout(() => {
      setRowStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 4000);
  };

  const handleApprove = async (userId: string) => {
    if (!window.confirm("Are you sure you want to approve this user?")) return;
    try {
      const updated = await api.adminSetStatus(userId, "approved");
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      updateRowStatus(userId, "Approved successfully!");
    } catch (err: any) {
      updateRowStatus(userId, undefined, err?.message || "Failed to approve");
    }
  };

  const handleReject = async (userId: string) => {
    if (!window.confirm("Are you sure you want to reject this user?")) return;
    try {
      const updated = await api.adminSetStatus(userId, "rejected");
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      updateRowStatus(userId, "Rejected successfully!");
    } catch (err: any) {
      updateRowStatus(userId, undefined, err?.message || "Failed to reject");
    }
  };

  const handleStatusChange = async (userId: string, status: AccountStatus) => {
    if (!window.confirm(`Are you sure you want to change this user's status to ${status}?`)) return;
    try {
      const updated = await api.adminSetStatus(userId, status);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      updateRowStatus(userId, `Status updated to ${status}!`);
    } catch (err: any) {
      updateRowStatus(userId, undefined, err?.message || "Failed to update status");
    }
  };

  const handleDelete = async (userId: string, displayName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${displayName}? This cannot be undone.`)) return;
    try {
      await api.adminDeleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      updateRowStatus(userId, "User deleted successfully!");
    } catch (err: any) {
      updateRowStatus(userId, undefined, err?.message || "Failed to delete user");
    }
  };

  const handleSetGroups = async (userId: string, groupIdsStr: string) => {
    const groupIds = groupIdsStr.split(",").map((g) => g.trim()).filter((g) => g.length > 0);
    try {
      await api.adminSetGroups(userId, groupIds);
      updateRowStatus(userId, "Groups updated successfully!");
    } catch (err: any) {
      updateRowStatus(userId, undefined, err?.message || "Failed to update groups");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const created = await api.adminCreateGroup(newGroupName.trim(), newGroupDesc.trim());
      setGroups((prev) => [...prev, created]);
      setNewGroupName("");
      setNewGroupDesc("");
      alert("Group created successfully!");
    } catch (err: any) {
      alert(err?.message || "Failed to create group");
    }
  };

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeatureKey.trim()) return;
    try {
      const created = await api.adminCreateFeature(newFeatureKey.trim(), newFeatureDesc.trim());
      setFeatures((prev) => [...prev, created]);
      setNewFeatureKey("");
      setNewFeatureDesc("");
      alert("Feature created successfully!");
    } catch (err: any) {
      alert(err?.message || "Failed to create feature");
    }
  };

  const handleAssignFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignFeatureKey || !assignSubjectId.trim()) return;
    if (!window.confirm("Are you sure you want to update this feature assignment?")) return;
    try {
      await api.adminSetFeatureAssignment({
        featureKey: assignFeatureKey,
        subjectType: assignSubjectType,
        subjectId: assignSubjectId.trim(),
        enabled: assignEnabled,
      });
      alert("Feature rule assigned successfully!");
      setAssignSubjectId("");
    } catch (err: any) {
      alert(err?.message || "Failed to assign feature rule");
    }
  };

  if (loading) {
    return (
      <ScrollArea className="admin-scroll-area" data-testid="admin-scroll-area">
        <div data-testid="admin-scroll-content" style={{ paddingRight: 20, paddingBottom: 20 }}>
          <div className="admin-page-container loading"><div className="spinner" /></div>
        </div>
      </ScrollArea>
    );
  }

  const pendingUsers = users.filter((u) => u.status === "pending");
  const processedUsers = users.filter((u) => u.status !== "pending");

  return (
    <ScrollArea className="admin-scroll-area" data-testid="admin-scroll-area">
      <div data-testid="admin-scroll-content" style={{ paddingRight: 20, paddingBottom: 20 }}>
      <div className="admin-page-container">
      <style>{`
        .admin-page-container {
          padding: 30px;
          max-width: 1200px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: var(--text-primary);
        }

        .admin-page-container.loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }

        .admin-header {
          margin-bottom: 30px;
        }

        .admin-header h1 {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: var(--purple);
        }

        .admin-header p {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0;
        }

        .admin-nav {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
        }

        .admin-nav button {
          padding: 8px 16px;
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          background: var(--surface-1);
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .admin-nav button[aria-pressed="true"] {
          background: var(--interactive-selected);
          border-color: var(--border-strong);
          color: var(--purple);
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .metric-card {
          background: var(--surface-1);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 20px;
        }

        .metric-card h3 {
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
          margin: 0 0 8px 0;
        }

        .metric-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .admin-section {
          background: var(--surface-1);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 30px;
        }

        .admin-section h2 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 20px 0;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 10px;
        }

        .admin-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .admin-table th, .admin-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-subtle);
          font-size: 14px;
        }

        .admin-table th {
          font-weight: 600;
          color: var(--text-secondary);
        }

        .btn-approve {
          background: var(--color-learning-bg);
          color: var(--success);
          border: 1px solid var(--success);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          margin-right: 8px;
        }

        .btn-reject {
          background: var(--color-danger-bg-soft);
          color: var(--error);
          border: 1px solid var(--error);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-delete {
          background: var(--color-danger-bg-soft);
          color: var(--color-danger-text-strong);
          border: 1px solid var(--error);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          margin-left: 8px;
        }

        .btn-delete:hover {
          background: var(--color-danger-bg-hover);
        }

        .group-input {
          background: var(--surface-2);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 6px 10px;
          color: var(--text-primary);
          font-size: 12px;
          width: 180px;
        }

        .status-select {
          background: var(--surface-2);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
        }

        .admin-forms-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
        }

        .admin-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .form-group input, .form-group select {
          background: var(--surface-2);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 8px 12px;
          color: var(--text-primary);
          font-size: 14px;
        }

        .btn-submit {
          background: var(--button-primary-bg);
          border: none;
          color: var(--button-primary-text);
          font-weight: 600;
          padding: 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 10px;
        }

        .row-status {
          font-size: 12px;
          font-weight: 500;
          margin-left: 10px;
        }
        .row-status.success { color: var(--success); }
        .row-status.error { color: var(--error); }
      `}</style>

      <div className="admin-header">
        <h1>Administration</h1>
        <p>Manage user approvals, group roles, feature gates, and metrics.</p>
      </div>

      <nav className="admin-nav">
        <button
          type="button"
          aria-pressed={view === "management"}
          onClick={() => setView("management")}
        >
          Management
        </button>
        <button
          type="button"
          aria-pressed={view === "analytics"}
          onClick={() => setView("analytics")}
        >
          Analytics
        </button>
      </nav>

      {view === "analytics" ? (
        <AdminAnalyticsPage adminStatistics={(range, appKey) => api.adminStatistics(range, appKey)} />
      ) : (
        <>
          {error && <div className="account-gate-error" style={{ marginBottom: "30px" }}>{error}</div>}

          {metrics && (
            <div className="metrics-grid">
              <div className="metric-card">
                <h3>Approved Users</h3>
                <div className="metric-value">{metrics.approvedUsers}</div>
              </div>
              <div className="metric-card">
                <h3>Pending Users</h3>
                <div className="metric-value">{metrics.pendingUsers}</div>
              </div>
              <div className="metric-card">
                <h3>30-Day Active Users</h3>
                <div className="metric-value">{metrics.activeUsersLast30Days}</div>
              </div>
              <div className="metric-card">
                <h3>Total Events</h3>
                <div className="metric-value">
                  {metrics.eventsByName.reduce((acc, curr) => acc + curr.count, 0)}
                </div>
              </div>
            </div>
          )}

          {/* Section 1: Pending Accounts */}
          <section className="admin-section">
            <h2>Pending Accounts</h2>
            {pendingUsers.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>No pending account approvals.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.email}</td>
                      <td>
                        <button className="btn-approve" type="button" onClick={() => handleApprove(user.id)}>Approve</button>
                        <button className="btn-reject" type="button" onClick={() => handleReject(user.id)}>Reject</button>
                        <button className="btn-delete" type="button" onClick={() => handleDelete(user.id, user.displayName)}>Delete</button>
                        {rowStatus[user.id]?.success && (
                          <span className="row-status success">{rowStatus[user.id].success}</span>
                        )}
                        {rowStatus[user.id]?.error && (
                          <span className="row-status error">{rowStatus[user.id].error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Section 2: Approved/Rejected Accounts */}
          <section className="admin-section">
            <h2>Approved / Rejected Accounts</h2>
            <table className="admin-table">
              <thead>
                   <tr>
                     <th>Name</th>
                     <th>Email</th>
                     <th>Status</th>
                     <th>Groups (comma separated)</th>
                     <th>Actions</th>
                   </tr>
              </thead>
              <tbody>
                {processedUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.displayName}</td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        className="status-select"
                        value={user.status}
                        onChange={(e) => handleStatusChange(user.id, e.target.value as AccountStatus)}
                      >
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="pending">Pending</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="group-input"
                        type="text"
                        placeholder="Group IDs (comma separated)"
                        onBlur={(e) => handleSetGroups(user.id, e.target.value)}
                      />
                      {rowStatus[user.id]?.success && (
                        <span className="row-status success">{rowStatus[user.id].success}</span>
                      )}
                      {rowStatus[user.id]?.error && (
                        <span className="row-status error">{rowStatus[user.id].error}</span>
                      )}
                    </td>
                    <td>
                      <button className="btn-delete" type="button" onClick={() => handleDelete(user.id, user.displayName)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Section 3: Feature & Group Access Configurations */}
          <div className="admin-forms-row">
            <section className="admin-section">
              <h2>Create Group</h2>
              <form className="admin-form" onSubmit={handleCreateGroup}>
                <div className="form-group">
                  <label htmlFor="group-name">Group Name</label>
                  <input
                    id="group-name"
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. beta_testers"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="group-desc">Description</label>
                  <input
                    id="group-desc"
                    type="text"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="Beta testing users group"
                  />
                </div>
                <button className="btn-submit" type="submit">Create Group</button>
              </form>
            </section>

            <section className="admin-section">
              <h2>Create Feature</h2>
              <form className="admin-form" onSubmit={handleCreateFeature}>
                <div className="form-group">
                  <label htmlFor="feat-key">Feature Key</label>
                  <input
                    id="feat-key"
                    type="text"
                    value={newFeatureKey}
                    onChange={(e) => setNewFeatureKey(e.target.value)}
                    placeholder="e.g. advanced_search"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="feat-desc">Description</label>
                  <input
                    id="feat-desc"
                    type="text"
                    value={newFeatureDesc}
                    onChange={(e) => setNewFeatureDesc(e.target.value)}
                    placeholder="Allows users to use FTS search fields"
                  />
                </div>
                <button className="btn-submit" type="submit">Create Feature</button>
              </form>
            </section>

            <section className="admin-section">
              <h2>Assign Feature Access Rule</h2>
              <form className="admin-form" onSubmit={handleAssignFeature}>
                <div className="form-group">
                  <label htmlFor="rule-feat">Feature</label>
                  <select
                    id="rule-feat"
                    value={assignFeatureKey}
                    onChange={(e) => setAssignFeatureKey(e.target.value)}
                    required
                  >
                    <option value="">Select Feature</option>
                    {features.map((f) => (
                      <option key={f.id} value={f.key}>{f.key}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="rule-subject-type">Subject Type</label>
                  <select
                    id="rule-subject-type"
                    value={assignSubjectType}
                    onChange={(e) => {
                      setAssignSubjectType(e.target.value as "user" | "group");
                      setAssignSubjectId("");
                    }}
                    required
                  >
                    <option value="user">User ID</option>
                    <option value="group">Group ID</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="rule-subject-id">Subject ID (User or Group ID)</label>
                  {assignSubjectType === "user" ? (
                    <input
                      id="rule-subject-id"
                      type="text"
                      value={assignSubjectId}
                      onChange={(e) => setAssignSubjectId(e.target.value)}
                      placeholder="Paste User ID here"
                      required
                    />
                  ) : (
                    <select
                      id="rule-subject-id"
                      value={assignSubjectId}
                      onChange={(e) => setAssignSubjectId(e.target.value)}
                      required
                    >
                      <option value="">Select Group</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name} ({g.id})</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="rule-enabled">Assignment State</label>
                  <select
                    id="rule-enabled"
                    value={assignEnabled ? "true" : "false"}
                    onChange={(e) => setAssignEnabled(e.target.value === "true")}
                    required
                  >
                    <option value="true">Enable Access</option>
                    <option value="false">Disable Access</option>
                  </select>
                </div>
                <button className="btn-submit" type="submit">Assign Rule</button>
              </form>
            </section >
          </div>
        </>
      )}
      </div>
      </div>
    </ScrollArea>
  );
}
