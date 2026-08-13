"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

const APPROVAL_TYPES = ["leave", "expense", "invoice", "payroll", "project", "document", "general"] as const;

interface ApprovalRecord {
  _id: string;
  type: string;
  title: string;
  description?: string;
  requestedBy: { _id: string; name: string; email: string; role: string };
  approvedBy?: { _id: string; name: string; email: string };
  status: "pending" | "approved" | "rejected";
  remarks?: string;
  decidedAt?: string;
  createdAt: string;
}

function initials(name: string) {
  return name?.charAt(0).toUpperCase() || "?";
}

export default function ApprovalsPage() {
  const { data: session, status } = useSession();
  const myId = (session?.user as any)?.id;

  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [deciding, setDeciding] = useState<ApprovalRecord | null>(null);
  const [decideAction, setDecideAction] = useState<"approved" | "rejected">("approved");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ type: "general", title: "", description: "" });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchApprovals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("status", tab);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/approvals?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setApprovals(data.approvals);
      setStats(data.stats || {});
      setCanApprove(data.canApprove);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error("Error fetching approvals:", err);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    if (status === "authenticated") fetchApprovals();
  }, [fetchApprovals, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    pollingRef.current = setInterval(fetchApprovals, 15000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchApprovals, status]);

  const openDecide = (a: ApprovalRecord, action: "approved" | "rejected") => {
    setDeciding(a);
    setDecideAction(action);
    setRemarks("");
  };

  const handleDecide = async () => {
    if (!deciding) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approvals/${deciding._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decideAction, remarks: remarks.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update request");
        return;
      }
      setDeciding(null);
      fetchApprovals();
    } catch (err) {
      console.error("Error deciding approval:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (id: string) => {
    if (!window.confirm("Withdraw this approval request?")) return;
    try {
      const res = await fetch(`/api/approvals/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to withdraw request");
        return;
      }
      fetchApprovals();
    } catch (err) {
      console.error("Error withdrawing approval:", err);
    }
  };

  const handleCreate = async () => {
    if (!newForm.title.trim()) {
      setFormError("Title is required");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newForm.type,
          title: newForm.title.trim(),
          description: newForm.description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create request");
      }
      setShowNew(false);
      setNewForm({ type: "general", title: "", description: "" });
      fetchApprovals();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return <LoadingCenter />;

  const pendingCount = stats.pending ?? 0;

  return (
    <PageShell>
      <PageHeader
        title="Approval Inbox"
        description={
          canApprove
            ? "Review and decide on requests across the company"
            : "Track the status of your approval requests"
        }
        badge={pendingCount > 0 ? <span className="count-chip">{pendingCount} pending</span> : undefined}
        actions={
          <button onClick={() => { setShowNew(true); setFormError(""); }} className="btn btn-primary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Request
          </button>
        }
      />

      <div className="summary-strip">
        <div className="summary-item">
          <div className="tile tile-sm tile-amber">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{pendingCount}</div>
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
            <div className="summary-num">{stats.approved ?? 0}</div>
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
            <div className="summary-num">{stats.rejected ?? 0}</div>
            <div className="summary-label">Rejected</div>
          </div>
        </div>
      </div>

      <div className="tab-bar" style={{ overflowX: "auto", maxWidth: "100%" }}>
        {(["all", "pending", "approved", "rejected"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`tab-btn${tab === t ? " active" : ""}`}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "pending" && pendingCount > 0 && (
              <span className="badge badge-amber" style={{ fontSize: 10, padding: "1px 6px" }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="card desktop-user-table">
        <div className="card-header">
          <h2>Requests</h2>
          <span className="count-chip">{loading ? "â€”" : approvals.length} shown</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Type</th>
                {canApprove && <th>Requested By</th>}
                <th>Date</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canApprove ? 6 : 5} style={{ textAlign: "center", padding: "48px 20px" }}>
                    <div className="loading-center" style={{ padding: 0 }}>
                      <div className="spinner" /><span>Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : approvals.length === 0 ? (
                <tr>
                  <td colSpan={canApprove ? 6 : 5} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    No approval requests found
                  </td>
                </tr>
              ) : (
                approvals.map((a) => (
                  <ApprovalRow
                    key={a._id}
                    a={a}
                    myId={myId}
                    canApprove={canApprove}
                    onDecide={openDecide}
                    onWithdraw={handleWithdraw}
                  />
                ))
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
              <div className="spinner" /><span>Loading...</span>
            </div>
          </div>
        ) : approvals.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No requests</p>
              <p>No approval requests found for this filter.</p>
            </div>
          </div>
        ) : (
          approvals.map((a) => {
            const isOwn = a.requestedBy?._id === myId;
            return (
              <div key={a._id} className="user-card" style={{ alignItems: "flex-start" }}>
                <div className="avatar avatar-sm" style={{ background: "linear-gradient(135deg, #8b5cf6, #a78bfa)" }}>
                  {initials(a.requestedBy?.name || "?")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5, margin: 0 }}>{a.title}</p>
                    <ApprovalBadge status={a.status} />
                  </div>
                  {a.description && (
                    <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "4px 0 0", lineHeight: 1.4 }}>{a.description}</p>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span className="badge badge-gray" style={{ textTransform: "capitalize" }}>{a.type}</span>
                    {canApprove && (
                      <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>by {a.requestedBy?.name}</span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {a.status === "pending" && canApprove && !isOwn && (
                      <>
                        <button onClick={() => openDecide(a, "approved")} className="btn btn-primary btn-sm">Approve</button>
                        <button onClick={() => openDecide(a, "rejected")} className="btn btn-danger btn-sm">Reject</button>
                      </>
                    )}
                    {a.status === "pending" && isOwn && (
                      <button onClick={() => handleWithdraw(a._id)} className="btn btn-ghost btn-sm">Withdraw</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-ghost" style={{ padding: "8px 16px" }}>Previous</button>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-ghost" style={{ padding: "8px 16px" }}>Next</button>
        </div>
      )}

      {deciding && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeciding(null); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{decideAction === "approved" ? "Approve" : "Reject"} Request</h2>
              <button onClick={() => setDeciding(null)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "0 0 16px" }}>
                {deciding.title}{deciding.description ? ` â€” ${deciding.description}` : ""}
              </p>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>
                Remarks <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder={decideAction === "rejected" ? "Reason for rejection..." : "Note for the requester..."}
                className="input"
                style={{ resize: "none" }}
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeciding(null)} className="btn btn-ghost">Cancel</button>
              <button
                onClick={handleDecide}
                disabled={submitting}
                className={decideAction === "approved" ? "btn btn-primary" : "btn btn-danger"}
              >
                {submitting ? "Saving..." : decideAction === "approved" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>New Approval Request</h2>
              <button onClick={() => setShowNew(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {formError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  <span>{formError}</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Type</label>
                  <select value={newForm.type} onChange={(e) => setNewForm({ ...newForm, type: e.target.value })} className="input">
                    {APPROVAL_TYPES.map((t) => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Title</label>
                  <input
                    type="text"
                    value={newForm.title}
                    onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                    placeholder="e.g. Overtime hours for week 3"
                    className="input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>
                    Description <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    value={newForm.description}
                    onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                    rows={3}
                    placeholder="Add context for the approver..."
                    className="input"
                    style={{ resize: "none" }}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowNew(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleCreate} disabled={submitting} className="btn btn-primary">
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function ApprovalRow({
  a, myId, canApprove, onDecide, onWithdraw,
}: {
  a: ApprovalRecord;
  myId: string;
  canApprove: boolean;
  onDecide: (a: ApprovalRecord, action: "approved" | "rejected") => void;
  onWithdraw: (id: string) => void;
}) {
  const isOwn = a.requestedBy?._id === myId;
  return (
    <tr>
      <td>
        <p style={{ fontWeight: 600, color: "var(--fg)", margin: 0 }}>{a.title}</p>
        {a.description && <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "2px 0 0", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</p>}
        {a.remarks && <p style={{ fontSize: 11, color: "var(--fg-subtle)", fontStyle: "italic", margin: "2px 0 0" }}>"{a.remarks}"</p>}
      </td>
      <td><span className="badge badge-gray" style={{ textTransform: "capitalize" }}>{a.type}</span></td>
      {canApprove && (
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="avatar avatar-sm" style={{ background: "linear-gradient(135deg, #2878f0, #0ea5e9)" }}>
              {initials(a.requestedBy?.name || "?")}
            </div>
            <span style={{ fontWeight: 600, color: "var(--fg)" }}>{a.requestedBy?.name || "â€”"}</span>
          </div>
        </td>
      )}
      <td style={{ whiteSpace: "nowrap", color: "var(--fg-muted)" }}>{new Date(a.createdAt).toLocaleDateString()}</td>
      <td><ApprovalBadge status={a.status} /></td>
      <td>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
          {a.status === "pending" && canApprove && !isOwn && (
            <>
              <button onClick={() => onDecide(a, "approved")} className="btn btn-primary btn-sm">Approve</button>
              <button onClick={() => onDecide(a, "rejected")} className="btn btn-danger btn-sm">Reject</button>
            </>
          )}
          {a.status === "pending" && isOwn && (
            <button onClick={() => onWithdraw(a._id)} className="btn btn-ghost btn-sm">Withdraw</button>
          )}
          {a.approvedBy && <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>by {a.approvedBy.name}</span>}
        </div>
      </td>
    </tr>
  );
}

function ApprovalBadge({ status }: { status: string }) {
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
