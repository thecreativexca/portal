"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter, FilterBar, FinanceNav } from "@/components/portal";

const ALLOWED_ROLES = ["ceo", "hr", "accounts"];

const STATUS_BADGE: Record<string, string> = {
  pending: "badge-amber",
  paid: "badge-green",
  cancelled: "badge-gray",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
};

interface PayrollRecord {
  _id: string;
  month: string;
  basicSalary: number;
  bonus: number;
  deduction: number;
  netSalary: number;
  paymentStatus: string;
  paidAt?: string;
  userId?: {
    fullName?: string;
    name?: string;
    email?: string;
    designation?: string;
    employeeId?: string;
  } | null;
}

export default function PayrollPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;

  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [byStatus, setByStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [statusFilter, setStatusFilter] = useState("");

  // Edit modal
  const [editRecord, setEditRecord] = useState<PayrollRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ basicSalary: "", bonus: "", deduction: "", paymentStatus: "pending" });

  // Generate modal
  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(currentMonth());
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ month: string; created: number; skipped: number; totalEmployees: number } | null>(null);
  const [genError, setGenError] = useState("");

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role && !ALLOWED_ROLES.includes(role))
      redirect("/");
  }, [authStatus, role]);

  const canManage = role === "ceo" || role === "hr" || role === "accounts";

  const fetchPayroll = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (monthFilter) params.set("month", monthFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("pageSize", "200");
      const res = await fetch(`/api/payroll?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRecords(data.records || []);
      setSummary(data.summary);
      setByStatus(data.byStatus || []);
    } catch (err) {
      console.error("Error fetching payroll:", err);
    } finally {
      setLoading(false);
    }
  }, [monthFilter, statusFilter]);

  useEffect(() => {
    if (role && ALLOWED_ROLES.includes(role)) fetchPayroll();
  }, [role, fetchPayroll]);

  const openEdit = (r: PayrollRecord) => {
    setEditRecord(r);
    setForm({
      basicSalary: String(r.basicSalary),
      bonus: String(r.bonus),
      deduction: String(r.deduction),
      paymentStatus: r.paymentStatus,
    });
    setError("");
  };

  const handleSave = async () => {
    if (!editRecord) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/payroll/${editRecord._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basicSalary: form.basicSalary,
          bonus: form.bonus,
          deduction: form.deduction,
          paymentStatus: form.paymentStatus,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to update payroll");
      }
      setEditRecord(null);
      fetchPayroll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update payroll");
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (r: PayrollRecord) => {
    if (!window.confirm(`Mark ${r.userId?.fullName || r.userId?.name || "employee"} ${monthLabel(r.month)} as paid?`)) return;
    try {
      const res = await fetch(`/api/payroll/${r._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "paid" }),
      });
      if (res.ok) fetchPayroll();
    } catch {}
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError("");
    setGenResult(null);
    try {
      const res = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: genMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate payroll");
      setGenResult(data);
      setMonthFilter(genMonth);
      fetchPayroll();
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : "Failed to generate payroll");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteError("");
    try {
      const res = await fetch(`/api/payroll/${deletingId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        setDeleteError(d.error || "Failed to delete record");
        return;
      }
      setDeletingId(null);
      fetchPayroll();
    } catch {
      setDeleteError("Something went wrong");
    }
  };

  const empName = (r: PayrollRecord) => r.userId?.fullName || r.userId?.name || "Unknown";

  if (authStatus === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Payroll"
        description="Generate monthly runs, adjust pay, and track disbursements"
        badge={records.length > 0 ? <span className="count-chip">{records.length} records</span> : undefined}
        actions={
          canManage ? (
            <button
              onClick={() => { setGenOpen(true); setGenResult(null); setGenError(""); setGenMonth(currentMonth()); }}
              className="btn btn-primary"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 0a2.25 2.25 0 002.25 2.25h12A2.25 2.25 0 0020.25 12m-16.5 0a2.25 2.25 0 01-2.25-2.25V7.5A2.25 2.25 0 015.25 5.25h13.5A2.25 2.25 0 0121 7.5v2.25a2.25 2.25 0 01-2.25 2.25m0 0a2.25 2.25 0 01-2.25 2.25h-3M8.25 12H8.25m6.75 0H15" />
              </svg>
              Generate Payroll
            </button>
          ) : undefined
        }
      />

      <FinanceNav />

      {/* Summary strip */}
      <div className="summary-strip">
        <div className="summary-item">
          <span className="tile tile-blue">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(summary?.totalNet ?? 0)}</p>
            <p className="summary-label">Net Pay</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-purple">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(summary?.totalBasic ?? 0)}</p>
            <p className="summary-label">Basic</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-green">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(summary?.totalBonus ?? 0)}</p>
            <p className="summary-label">Bonus</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-amber">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(summary?.totalDeduction ?? 0)}</p>
            <p className="summary-label">Deductions</p>
          </div>
        </div>
      </div>

      {/* Status breakdown */}
      {byStatus.length > 0 && (
        <div className="summary-strip">
          {byStatus.map((s: { _id: string; total: number; count: number }) => (
            <div key={s._id} className="summary-item">
              <div className={`tile tile-sm ${s._id === "paid" ? "tile-green" : s._id === "pending" ? "tile-amber" : "tile-rose"}`}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="summary-num" style={{ fontSize: 16 }}>{fmt(s.total)}</div>
                <div className="summary-label">{s._id} Â· {s.count} emp.</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FilterBar>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 150 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 140 }}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="count-chip" style={{ marginLeft: "auto" }}>{records.length} records</span>
      </FilterBar>

      {/* Desktop table */}
      <div className="card desktop-user-table">
        <div className="card-header">
          <h2>{monthLabel(monthFilter)} Payroll</h2>
          <span className="count-chip">{loading ? "â€”" : records.length} employees</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Month</th>
                <th style={{ textAlign: "right" }}>Basic</th>
                <th style={{ textAlign: "right" }}>Bonus</th>
                <th style={{ textAlign: "right" }}>Deduction</th>
                <th style={{ textAlign: "right" }}>Net</th>
                <th>Status</th>
                {canManage && <th style={{ textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    <div className="loading-center" style={{ padding: 0 }}>
                      <div className="spinner" />
                      <span>Loading payroll...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    No payroll records for this period
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="tile tile-sm tile-purple">{initials(empName(r))}</span>
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-zinc-50">{empName(r)}</div>
                          {r.userId?.designation && (
                            <div className="text-xs text-zinc-400">{r.userId.designation}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-zinc-500 dark:text-zinc-400">{monthLabel(r.month)}</td>
                    <td style={{ textAlign: "right" }} className="text-zinc-600 dark:text-zinc-300">{fmt(r.basicSalary)}</td>
                    <td style={{ textAlign: "right" }} className="text-emerald-600 dark:text-emerald-400">{fmt(r.bonus)}</td>
                    <td style={{ textAlign: "right" }} className="text-amber-600 dark:text-amber-400">âˆ’{fmt(r.deduction)}</td>
                    <td style={{ textAlign: "right" }} className="font-semibold text-zinc-900 dark:text-zinc-50">{fmt(r.netSalary)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.paymentStatus] || "badge-gray"}`}>
                        <span className="dot" />
                        {r.paymentStatus === "pending" ? "Pending" : r.paymentStatus === "paid" ? "Paid" : "Cancelled"}
                      </span>
                      {r.paidAt && (
                        <span className="ml-2 text-xs text-zinc-400">{new Date(r.paidAt).toLocaleDateString()}</span>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {r.paymentStatus === "pending" && (
                            <button onClick={() => markPaid(r)} className="btn btn-primary btn-sm" title="Mark as paid">
                              Pay
                            </button>
                          )}
                          <button onClick={() => openEdit(r)} className="icon-btn primary" title="Edit">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                          <button onClick={() => setDeletingId(r._id)} className="icon-btn danger" title="Delete">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
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
              <div className="spinner" />
              <span>Loading payroll...</span>
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No payroll records</p>
              <p>No records for {monthLabel(monthFilter)}.</p>
            </div>
          </div>
        ) : (
          records.map((r) => (
            <div key={r._id} className="user-card">
              <span className="tile tile-sm tile-purple">{initials(empName(r))}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{empName(r)}</p>
                  <span className="font-bold text-sm text-zinc-900 dark:text-zinc-50 shrink-0">{fmt(r.netSalary)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className={`badge ${STATUS_BADGE[r.paymentStatus] || "badge-gray"}`}> 
                    {r.paymentStatus === "pending" ? "Pending" : r.paymentStatus === "paid" ? "Paid" : "Cancelled"}
                  </span>
                  <span>{monthLabel(r.month)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Basic <b className="text-zinc-700 dark:text-zinc-300">{fmt(r.basicSalary)}</b></span>
                  <span>Â· Bonus <b className="text-emerald-600">{fmt(r.bonus)}</b></span>
                  <span>Â· Deduction <b className="text-amber-600">âˆ’{fmt(r.deduction)}</b></span>
                </div>
              </div>
              {canManage && (
                <div className="flex flex-col gap-1 shrink-0">
                  {r.paymentStatus === "pending" && (
                    <button onClick={() => markPaid(r)} className="btn btn-primary btn-sm" style={{ padding: "4px 10px" }}>Pay</button>
                  )}
                  <button onClick={() => openEdit(r)} className="icon-btn primary" style={{ width: 30, height: 30 }} title="Edit">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  </button>
                  <button onClick={() => setDeletingId(r._id)} className="icon-btn danger" style={{ width: 30, height: 30 }} title="Delete">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit modal */}
      {editRecord && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditRecord(null); }}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>Edit Payroll</h2>
              <button onClick={() => setEditRecord(null)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 16 }}>
                {empName(editRecord)} Â· {monthLabel(editRecord.month)}
              </p>
              {error && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Basic Salary</label>
                  <input type="number" min={0} value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} className="input" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Bonus</label>
                  <input type="number" min={0} value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} className="input" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Deduction</label>
                  <input type="number" min={0} value={form.deduction} onChange={(e) => setForm({ ...form, deduction: e.target.value })} className="input" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Status</label>
                  <select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })} className="input">
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="summary-item" style={{ borderRadius: 12, padding: 14, background: "var(--bg-card2)" }}>
                <div>
                  <div className="summary-label">Net pay</div>
                  <div className="summary-num">
                    {fmt(
                      Math.max(0, (Number(form.basicSalary) || 0) + (Number(form.bonus) || 0) - (Number(form.deduction) || 0))
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditRecord(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate modal */}
      {genOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setGenOpen(false); }}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>Generate Payroll</h2>
              <button onClick={() => setGenOpen(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 16 }}>
                Creates one pending record per active employee for the selected month, seeded from their salary.
              </p>
              {genError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>{genError}</div>
              )}
              {genResult && (
                <div className="alert alert-success" style={{ marginBottom: 16 }}>
                  Created {genResult.created} record{genResult.created === 1 ? "" : "s"} for {monthLabel(genResult.month)}.
                  {genResult.skipped > 0 ? ` ${genResult.skipped} already existed.` : ""}
                </div>
              )}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Month</label>
                <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="input" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setGenOpen(false)} className="btn btn-ghost">Close</button>
              <button onClick={handleGenerate} disabled={generating} className="btn btn-primary">
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDeletingId(null); setDeleteError(""); } }}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Delete Payroll Record</h2>
              <button onClick={() => { setDeletingId(null); setDeleteError(""); }} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>This permanently removes the payroll record. This cannot be undone.</p>
              {deleteError && (
                <div className="alert alert-error" style={{ marginTop: 12 }}>{deleteError}</div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => { setDeletingId(null); setDeleteError(""); }} className="btn btn-ghost">Cancel</button>
              <button onClick={handleDelete} className="btn btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "?";
