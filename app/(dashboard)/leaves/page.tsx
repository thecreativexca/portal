"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

const LEAVE_TYPES = ["annual", "sick", "casual", "unpaid", "other"] as const;

interface LeaveRecord {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string };
  leaveType?: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: { _id: string; name: string; email: string };
  createdAt: string;
}

interface LeaveStats {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

function toInputDate(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

function leaveDays(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

export default function LeavesPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const myId = (session?.user as any)?.id;

  const isManager = ["ceo", "hr", "project_manager"].includes(role);

  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [stats, setStats] = useState<LeaveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "pending">("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
    reason: "",
    leaveType: "annual",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (tab === "pending") params.set("status", "pending");
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/leaves?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLeaves(data.leaves);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setTotal(data.pagination?.total ?? data.leaves?.length ?? 0);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error("Error fetching leaves:", err);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    if (role) fetchLeaves();
  }, [fetchLeaves, role]);

  const handleApply = async () => {
    setSaving(true);
    setFormError("");

    try {
      const url = editingId ? `/api/leaves/${editingId}` : "/api/leaves";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save leave");
      }

      setShowForm(false);
      setEditingId(null);
      setForm({ startDate: "", endDate: "", reason: "", leaveType: "annual" });
      fetchLeaves();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveReject = async (id: string, newStatus: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/leaves/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update leave");
        return;
      }

      fetchLeaves();
    } catch (err) {
      console.error("Error updating leave:", err);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      const res = await fetch(`/api/leaves/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to cancel leave");
        return;
      }
      fetchLeaves();
    } catch (err) {
      console.error("Error cancelling leave:", err);
    }
  };

  const handleEdit = (leave: LeaveRecord) => {
    setEditingId(leave._id);
    setForm({
      startDate: toInputDate(leave.startDate),
      endDate: toInputDate(leave.endDate),
      reason: leave.reason,
      leaveType: leave.leaveType || "annual",
    });
    setFormError("");
    setShowForm(true);
  };

  const openApply = () => {
    setEditingId(null);
    setForm({ startDate: "", endDate: "", reason: "", leaveType: "annual" });
    setFormError("");
    setShowForm(true);
  };

  if (status === "loading") {
    return <LoadingCenter />;
  }

  const pendingCount = stats?.byStatus?.pending ?? leaves.filter((l) => l.status === "pending").length;

  return (
    <PageShell>
      <PageHeader
        title="Leave Management"
        description={
          isManager
            ? "Review and manage employee leave requests"
            : "Apply for leave and view your history"
        }
        badge={
          total > 0 ? <span className="count-chip">{total} requests</span> : undefined
        }
        actions={
          <button onClick={openApply} className="btn btn-primary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Apply Leave
          </button>
        }
      />

      {/* Summary stats */}
      {isManager && stats && (
        <div className="summary-strip">
          <div className="summary-item">
            <div className="tile tile-sm tile-amber">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{stats.byStatus.pending ?? 0}</div>
              <div className="summary-label">Pending</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-green">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{stats.byStatus.approved ?? 0}</div>
              <div className="summary-label">Approved</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-rose">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{stats.byStatus.rejected ?? 0}</div>
              <div className="summary-label">Rejected</div>
            </div>
          </div>
          {Object.keys(stats.byType).length > 0 && (
            <div className="summary-item">
              <div className="tile tile-sm tile-purple">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.015 1.542l1.487 9.226A2.25 2.25 0 0116.182 13H4.818a2.25 2.25 0 01-2.015-2.542l1.487-9.226A2.25 2.25 0 018.818 2.25H10.5" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{Object.values(stats.byType).reduce((a, b) => a + b, 0)}</div>
                <div className="summary-label">By Type</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Type breakdown chips */}
      {isManager && stats && Object.keys(stats.byType).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(stats.byType).map(([type, count]) => (
            <span key={type} className="badge badge-gray" style={{ textTransform: "capitalize" }}>
              {type}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Manager tabs */}
      {isManager && (
        <div className="tab-bar">
          <button
            onClick={() => { setTab("all"); setPage(1); }}
            className={`tab-btn${tab === "all" ? " active" : ""}`}
          >
            All Leaves
          </button>
          <button
            onClick={() => { setTab("pending"); setPage(1); }}
            className={`tab-btn${tab === "pending" ? " active" : ""}`}
          >
            Pending
            {pendingCount > 0 && (
              <span className="badge badge-amber" style={{ fontSize: 10, padding: "1px 6px" }}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Desktop table */}
      <div className="card desktop-user-table">
        <div className="card-header">
          <h2>{tab === "pending" ? "Pending Requests" : "Leave Records"}</h2>
          <span className="count-chip">{loading ? "â€”" : leaves.length} shown</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {isManager && <th>Employee</th>}
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Type</th>
                <th>Reason</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isManager ? 8 : 7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    <div className="loading-center" style={{ padding: 0 }}>
                      <div className="spinner" />
                      <span>Loading leaves...</span>
                    </div>
                  </td>
                </tr>
              ) : leaves.length === 0 ? (
                <tr>
                  <td colSpan={isManager ? 8 : 7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    No leave records found
                  </td>
                </tr>
              ) : (
                leaves.map((leave) => {
                  const isOwn = leave.userId?._id === myId;
                  return (
                    <tr key={leave._id}>
                      {isManager && (
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="avatar avatar-sm">{initials(leave.userId?.name || "?")}</div>
                            <span style={{ fontWeight: 600, color: "var(--fg)" }}>
                              {leave.userId?.name || "â€”"}
                            </span>
                          </div>
                        </td>
                      )}
                      <td>{new Date(leave.startDate).toLocaleDateString()}</td>
                      <td>{new Date(leave.endDate).toLocaleDateString()}</td>
                      <td style={{ fontWeight: 600, color: "var(--fg)" }}>
                        {leaveDays(leave.startDate, leave.endDate)}
                      </td>
                      <td>
                        <span className="badge badge-gray" style={{ textTransform: "capitalize" }}>
                          {leave.leaveType || "annual"}
                        </span>
                      </td>
                      <td style={{ maxWidth: 200 }} className="truncate">{leave.reason}</td>
                      <td><LeaveStatusBadge status={leave.status} /></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
                          {isOwn && leave.status === "pending" && (
                            <>
                              <button onClick={() => handleEdit(leave)} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }}>
                                Edit
                              </button>
                              <button onClick={() => handleCancel(leave._id)} className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 12 }}>
                                Cancel
                              </button>
                            </>
                          )}
                          {isManager && !isOwn && leave.status === "pending" && (
                            <>
                              <button onClick={() => handleApproveReject(leave._id, "approved")} className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12 }}>
                                Approve
                              </button>
                              <button onClick={() => handleApproveReject(leave._id, "rejected")} className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 12 }}>
                                Reject
                              </button>
                            </>
                          )}
                          {leave.approvedBy && (
                            <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                              by {leave.approvedBy.name}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="mobile-user-list space-y-3">
        {loading ? (
          <div className="card">
            <div className="loading-center" style={{ padding: "40px 20px" }}>
              <div className="spinner" />
              <span>Loading leaves...</span>
            </div>
          </div>
        ) : leaves.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No leave records</p>
              <p>No records found for this selection.</p>
            </div>
          </div>
        ) : (
          leaves.map((leave) => {
            const isOwn = leave.userId?._id === myId;
            return (
              <div key={leave._id} className="user-card">
                <div className="avatar avatar-sm">
                  {isManager ? initials(leave.userId?.name || "?") : leaveDays(leave.startDate, leave.endDate)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5, margin: 0 }}>
                      {new Date(leave.startDate).toLocaleDateString()} â€“ {new Date(leave.endDate).toLocaleDateString()}
                    </p>
                    <LeaveStatusBadge status={leave.status} />
                  </div>
                  {isManager && (
                    <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "2px 0 0" }}>
                      {leave.userId?.name}
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span className="badge badge-gray" style={{ fontSize: 11, textTransform: "capitalize" }}>
                      {leave.leaveType || "annual"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                      {leaveDays(leave.startDate, leave.endDate)} day(s)
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "6px 0 0", lineHeight: 1.4 }}>
                    {leave.reason}
                  </p>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {isOwn && leave.status === "pending" && (
                      <>
                        <button onClick={() => handleEdit(leave)} className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: 11 }}>
                          Edit
                        </button>
                        <button onClick={() => handleCancel(leave._id)} className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 11 }}>
                          Cancel
                        </button>
                      </>
                    )}
                    {isManager && !isOwn && leave.status === "pending" && (
                      <>
                        <button onClick={() => handleApproveReject(leave._id, "approved")} className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 11 }}>
                          Approve
                        </button>
                        <button onClick={() => handleApproveReject(leave._id, "rejected")} className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 11 }}>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn btn-ghost"
            style={{ padding: "8px 16px" }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn btn-ghost"
            style={{ padding: "8px 16px" }}
          >
            Next
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {/* Apply / Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{editingId ? "Edit Leave" : "Apply for Leave"}</h2>
              <button onClick={() => setShowForm(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {formError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{formError}</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Leave Type</label>
                  <select
                    value={form.leaveType}
                    onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                    className="input"
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Reason</label>
                  <textarea
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Explain why you need leave (min 10 characters)..."
                    rows={3}
                    className="input"
                    style={{ resize: "none" }}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowForm(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={handleApply} disabled={saving} className="btn btn-primary">
                {saving ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Saving...
                  </>
                ) : editingId ? "Save Changes" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function LeaveStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "badge badge-amber",
    approved: "badge badge-green",
    rejected: "badge badge-rose",
  };
  return (
    <span className={map[status] || "badge badge-gray"} style={{ textTransform: "capitalize" }}>
      {status}
    </span>
  );
}
