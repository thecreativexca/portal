"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter, FilterBar, FinanceNav } from "@/components/portal";

const ALLOWED_ROLES = ["ceo", "hr", "project_manager", "accounts"];

const CATEGORY_LABEL: Record<string, string> = {
  travel: "Travel",
  meals: "Meals",
  software: "Software",
  hardware: "Hardware",
  office: "Office",
  marketing: "Marketing",
  rent: "Rent",
  utilities: "Utilities",
  "professional-services": "Professional Services",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  travel: "#4f46e5",
  meals: "#f59e0b",
  software: "#10b981",
  hardware: "#ef4444",
  office: "#8b5cf6",
  marketing: "#06b6d4",
  rent: "#f97316",
  utilities: "#6366f1",
  "professional-services": "#14b8a6",
  other: "#71717a",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : "â€”");

interface ExpenseRecord {
  _id: string;
  category: string;
  amount: number;
  date: string;
  description?: string;
  projectId?: { _id: string; projectName: string } | null;
  createdBy?: { fullName?: string; name?: string } | null;
}

interface CategoryOption {
  _id: string;
  projectName: string;
}

export default function ExpensesPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [projects, setProjects] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    category: "travel",
    amount: "",
    date: "",
    projectId: "",
    description: "",
  });

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role && !ALLOWED_ROLES.includes(role))
      redirect("/");
  }, [authStatus, role]);

  const canManage = role === "ceo" || role === "accounts";

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("pageSize", "200");
      const res = await fetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setExpenses(data.expenses || []);
      setSummary(data.summary);
      setByCategory(data.byCategory || []);
    } catch (err) {
      console.error("Error fetching expenses:", err);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, from, to]);

  useEffect(() => {
    if (role && ALLOWED_ROLES.includes(role)) fetchExpenses();
  }, [role, fetchExpenses]);

  useEffect(() => {
    if (!role || !ALLOWED_ROLES.includes(role)) return;
    fetch("/api/projects?pageSize=200&status=active")
      .then((r) => r.json())
      .then((d) => setProjects((d.projects || []).map((x: any) => ({ _id: x._id, projectName: x.projectName }))))
      .catch(() => {});
  }, [role]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      category: "travel",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      projectId: "",
      description: "",
    });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (e: ExpenseRecord) => {
    setEditingId(e._id);
    setForm({
      category: e.category,
      amount: String(e.amount),
      date: new Date(e.date).toISOString().slice(0, 10),
      projectId: e.projectId?._id || "",
      description: e.description || "",
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload: any = { ...form };
      if (payload.projectId === "") payload.projectId = undefined;
      const res = await fetch(editingId ? `/api/expenses/${editingId}` : "/api/expenses", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save expense");
      }
      setModalOpen(false);
      fetchExpenses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteError("");
    try {
      const res = await fetch(`/api/expenses/${deletingId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        setDeleteError(d.error || "Failed to delete expense");
        return;
      }
      setDeletingId(null);
      fetchExpenses();
    } catch {
      setDeleteError("Something went wrong");
    }
  };

  const maxCategory = byCategory.reduce((m: number, c: any) => Math.max(m, c.total), 0);

  if (authStatus === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Expenses"
        description="Track company spending by category, project, and period"
        badge={expenses.length > 0 ? <span className="count-chip">{expenses.length} expenses</span> : undefined}
        actions={
          canManage ? (
            <button onClick={openCreate} className="btn btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Expense
            </button>
          ) : undefined
        }
      />

      <FinanceNav />

      {/* Summary strip */}
      <div className="summary-strip">
        <div className="summary-item">
          <span className="tile tile-blue">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(summary?.total ?? 0)}</p>
            <p className="summary-label">Total Spent</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-purple">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </span>
          <div>
            <p className="summary-num">{summary?.count ?? 0}</p>
            <p className="summary-label">Expenses</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-cyan">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75l2.25 2.25m0 0l2.25-2.25M16.5 15l-2.25 2.25m2.25-2.25l2.25 2.25M3 18h9.75" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(summary?.avg ?? 0)}</p>
            <p className="summary-label">Average</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-amber">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25M21 9.75v4.5a2.25 2.25 0 01-2.25 2.25H5.25a2.25 2.25 0 01-2.25-2.25v-4.5M21 9.75a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9.75" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(summary?.max ?? 0)}</p>
            <p className="summary-label">Largest</p>
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>By Category</h2>
            <span className="count-chip">{byCategory.length} categories</span>
          </div>
          <div className="card-body space-y-3.5">
            {byCategory.map((c: any) => (
              <div key={c._id} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[c._id] || "#71717a" }} />
                <span className="w-32 sm:w-44 text-sm text-zinc-600 dark:text-zinc-300 truncate">
                  {CATEGORY_LABEL[c._id] || c._id}
                </span>
                <div style={{ height: 8, flex: 1, borderRadius: 999, background: "var(--bg-card2)", overflow: "hidden" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${maxCategory ? Math.max(4, (c.total / maxCategory) * 100) : 0}%`, background: CATEGORY_COLORS[c._id] || "#71717a" }}
                  />
                </div>
                <span style={{ width: 24, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>{fmt(c.total)}</span>
                <span style={{ width: 28, textAlign: "right", fontSize: 11, color: "var(--fg-muted)" }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <FilterBar>
        <div className="search-wrap flex-1">
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input lg:w-48"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input lg:w-44" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input lg:w-44" />
      </FilterBar>

      {/* Desktop table */}
      <div className="card desktop-user-table">
        <div className="card-header">
          <h2>Expense Records</h2>
          <span className="count-chip">{loading ? "â€”" : expenses.length} shown</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Project</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Recorded By</th>
                {canManage && <th style={{ textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    <div className="loading-center" style={{ padding: 0 }}>
                      <div className="spinner" />
                      <span>Loading expenses...</span>
                    </div>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    No expenses found
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e._id}>
                    <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td>
                      <span className="badge" style={{ color: CATEGORY_COLORS[e.category] || "#71717a", borderColor: `${CATEGORY_COLORS[e.category] || "#71717a"}44`, background: `${CATEGORY_COLORS[e.category] || "#71717a"}1a` }}>
                        <span className="dot" style={{ width: 6, height: 6, background: CATEGORY_COLORS[e.category] || "#71717a" }} />
                        {CATEGORY_LABEL[e.category] || e.category}
                      </span>
                    </td>
                    <td className="max-w-[240px] truncate">{e.description || "â€”"}</td>
                    <td>{e.projectId?.projectName || "â€”"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--fg)" }}>{fmt(e.amount)}</td>
                    <td style={{ color: "var(--fg-muted)" }}>{e.createdBy?.fullName || e.createdBy?.name || "â€”"}</td>
                    {canManage && (
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(e)} className="icon-btn primary" title="Edit expense">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                          <button onClick={() => setDeletingId(e._id)} className="icon-btn danger" title="Delete expense">
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
              <span>Loading expenses...</span>
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No expenses found</p>
              <p>Try adjusting filters or add a new expense.</p>
            </div>
          </div>
        ) : (
          expenses.map((e) => (
            <div key={e._id} className="user-card">
              <span className="tile tile-sm" style={{ background: CATEGORY_COLORS[e.category] || "#71717a" }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.9)" }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {e.description || CATEGORY_LABEL[e.category] || e.category}
                  </p>
                  <span className="font-bold text-sm text-zinc-900 dark:text-zinc-50 shrink-0">{fmt(e.amount)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="badge" style={{ color: CATEGORY_COLORS[e.category] || "#71717a", borderColor: `${CATEGORY_COLORS[e.category] || "#71717a"}44`, background: `${CATEGORY_COLORS[e.category] || "#71717a"}1a`, padding: "1.5px 8px" }}>
                    {CATEGORY_LABEL[e.category] || e.category}
                  </span>
                  <span>{fmtDate(e.date)}</span>
                  {e.projectId?.projectName && <span className="truncate">Â· {e.projectId.projectName}</span>}
                </div>
              </div>
              {canManage && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => openEdit(e)} className="icon-btn primary" style={{ width: 30, height: 30 }} title="Edit">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  </button>
                  <button onClick={() => setDeletingId(e._id)} className="icon-btn danger" style={{ width: 30, height: 30 }} title="Delete">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>{editingId ? "Edit Expense" : "New Expense"}</h2>
              <button onClick={() => setModalOpen(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {error && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
              )}
              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Category <span className="text-red-500">*</span></label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Amount <span className="text-red-500">*</span></label>
                  <input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Project</label>
                  <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="input">
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>{p.projectName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What was this for?" className="input" style={{ resize: "none" }} />
              </div>
            </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Expense"}
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
              <h2>Delete Expense</h2>
              <button onClick={() => { setDeletingId(null); setDeleteError(""); }} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.5 }}>This permanently removes the expense record. This cannot be undone.</p>
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
