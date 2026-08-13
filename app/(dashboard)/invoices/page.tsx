"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter, FilterBar, FinanceNav } from "@/components/portal";

const ALLOWED_ROLES = ["ceo", "hr", "project_manager", "team_lead", "accounts"];

const STATUS_BADGE: Record<string, string> = {
  draft: "badge-gray",
  sent: "badge-blue",
  partially_paid: "badge-amber",
  paid: "badge-green",
  overdue: "badge-rose",
  cancelled: "badge-gray",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : "â€”");

interface Payment {
  _id: string;
  amount: number;
  date: string;
  method: string;
  note?: string;
  transactionId?: string;
}

interface InvoiceRecord {
  _id: string;
  invoiceNumber: string;
  amount: number;
  tax: number;
  paidAmount: number;
  outstanding: number;
  status: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  items?: { description: string; quantity: number; rate: number }[];
  projectId?: string | null;
  clientId: { _id: string; clientName: string };
  payments: Payment[];
}

interface Option {
  _id: string;
  name: string;
}

const emptyItem = { description: "", quantity: 1, rate: 0 };

export default function InvoicesPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [form, setForm] = useState({
    clientId: "",
    projectId: "",
    invoiceNumber: "",
    amount: "",
    tax: "",
    issueDate: "",
    dueDate: "",
    status: "draft",
    notes: "",
  });
  const [items, setItems] = useState<{ description: string; quantity: number; rate: number }[]>([
    { ...emptyItem },
  ]);

  // Payment modal
  const [payInvoice, setPayInvoice] = useState<InvoiceRecord | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [payForm, setPayForm] = useState({
    amount: "",
    date: "",
    method: "bank_transfer",
    transactionId: "",
    note: "",
  });

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role && !ALLOWED_ROLES.includes(role))
      redirect("/");
  }, [authStatus, role]);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (clientFilter) params.set("clientId", clientFilter);
      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error("Error fetching invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, clientFilter]);

  const fetchOptions = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        fetch("/api/clients?pageSize=200").then((r) => r.json()),
        fetch("/api/projects?pageSize=200&status=active").then((r) => r.json()),
      ]);
      setClients((c.clients || []).map((x: any) => ({ _id: x._id, name: x.clientName })));
      setProjects((p.projects || []).map((x: any) => ({ _id: x._id, name: x.projectName })));
    } catch (err) {
      console.error("Error fetching options:", err);
    }
  }, []);

  useEffect(() => {
    if (role && ALLOWED_ROLES.includes(role)) {
      fetchInvoices();
      fetchOptions();
    }
  }, [role, fetchInvoices, fetchOptions]);

  const canManage =
    role === "ceo" || role === "project_manager" || role === "accounts";

  const searchLower = search.toLowerCase();
  const filtered = invoices.filter(
    (inv) =>
      !searchLower ||
      inv.invoiceNumber.toLowerCase().includes(searchLower) ||
      (inv.clientId?.clientName || "").toLowerCase().includes(searchLower)
  );

  // Summary over all (non-cancelled) invoices â€” not the filtered view.
  const active = invoices.filter((i) => i.status !== "cancelled");
  const totalInvoiced = active.reduce((s, i) => s + i.amount + (i.tax || 0), 0);
  const totalPaid = active.reduce((s, i) => s + i.paidAmount, 0);
  const outstanding = Math.max(0, totalInvoiced - totalPaid);
  const overdue = active
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + i.outstanding, 0);

  const openCreate = () => {
    setForm({
      clientId: "",
      projectId: "",
      invoiceNumber: "",
      amount: "",
      tax: "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      status: "draft",
      notes: "",
    });
    setItems([{ ...emptyItem }]);
    setInvoiceError("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setSavingInvoice(true);
    setInvoiceError("");
    try {
      const payload: any = { ...form, items: items.filter((i) => i.description.trim()) };
      if (payload.clientId === "") payload.clientId = undefined;
      if (payload.projectId === "") payload.projectId = undefined;
      if (payload.tax === "") payload.tax = 0;
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create invoice");
      }
      setCreateOpen(false);
      fetchInvoices();
    } catch (err: unknown) {
      setInvoiceError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSavingInvoice(false);
    }
  };

  const openPayment = (inv: InvoiceRecord) => {
    setPayInvoice(inv);
    setPayForm({
      amount: String(Math.max(0, inv.outstanding)),
      date: new Date().toISOString().slice(0, 10),
      method: "bank_transfer",
      transactionId: "",
      note: "",
    });
    setPaymentError("");
  };

  const handlePayment = async () => {
    if (!payInvoice) return;
    setSavingPayment(true);
    setPaymentError("");
    try {
      const res = await fetch(`/api/invoices/${payInvoice._id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payForm),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to record payment");
      }
      setPayInvoice(null);
      fetchInvoices();
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (inv: InvoiceRecord, p: Payment) => {
    if (!window.confirm(`Remove this ${fmt(p.amount)} payment?`)) return;
    try {
      const res = await fetch(`/api/invoices/${inv._id}/payment/${p._id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchInvoices();
    } catch {}
  };

  const handleCancel = async (inv: InvoiceRecord) => {
    if (!window.confirm(`Cancel invoice ${inv.invoiceNumber}?`)) return;
    try {
      const res = await fetch(`/api/invoices/${inv._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) fetchInvoices();
    } catch {}
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteError("");
    try {
      const res = await fetch(`/api/invoices/${deletingId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        setDeleteError(d.error || "Failed to delete invoice");
        return;
      }
      setDeletingId(null);
      fetchInvoices();
    } catch {
      setDeleteError("Something went wrong");
    }
  };

  const clientName = (inv: InvoiceRecord) =>
    inv.clientId?.clientName || "â€”";

  if (authStatus === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Invoices"
        description="Generate invoices, track payments, and chase outstanding amounts"
        badge={invoices.length > 0 ? <span className="count-chip">{invoices.length} invoices</span> : undefined}
        actions={
          canManage ? (
            <button onClick={openCreate} className="btn btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Invoice
            </button>
          ) : undefined
        }
      />

      <FinanceNav />

      {/* Summary strip */}
      <div className="summary-strip">
        <div className="summary-item">
          <span className="tile tile-blue">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(totalInvoiced)}</p>
            <p className="summary-label">Total Invoiced</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-green">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(totalPaid)}</p>
            <p className="summary-label">Collected</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-amber">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(outstanding)}</p>
            <p className="summary-label">Outstanding</p>
          </div>
        </div>
        <div className="summary-item">
          <span className="tile tile-rose">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          </span>
          <div>
            <p className="summary-num">{fmt(overdue)}</p>
            <p className="summary-label">Overdue</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="search-wrap flex-1">
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search invoice number or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input lg:w-44"
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="input lg:w-52"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
      </FilterBar>

      {/* Desktop table */}
      <div className="card desktop-user-table">
        <div className="card-header">
          <h2>Invoice Records</h2>
          <span className="count-chip">{loading ? "â€”" : filtered.length} shown</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Dates</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Outstanding</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    <div className="loading-center" style={{ padding: 0 }}>
                      <div className="spinner" />
                      <span>Loading invoices...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    No invoices found
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <InvoiceRow
                    key={inv._id}
                    inv={inv}
                    canManage={canManage}
                    clientName={clientName(inv)}
                    onPay={openPayment}
                    onCancel={handleCancel}
                    onDelete={() => setDeletingId(inv._id)}
                    onDeletePayment={(p) => handleDeletePayment(inv, p)}
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
              <div className="spinner" />
              <span>Loading invoices...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No invoices found</p>
              <p>Try adjusting your filters or create a new invoice.</p>
            </div>
          </div>
        ) : (
          filtered.map((inv) => (
            <div key={inv._id} className="user-card">
              <div className="tile tile-sm tile-blue" style={{ width: 40, height: 40, fontSize: 11 }}>
                INV
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <button onClick={() => canManage && openPayment(inv)} disabled={!canManage} style={{ fontWeight: 700, fontSize: 13.5, color: "var(--fg)", background: "none", border: "none", padding: 0, cursor: canManage ? "pointer" : "default" }}>
                    {inv.invoiceNumber}
                  </button>
                  <span className={`badge ${STATUS_BADGE[inv.status] || "badge-gray"}`}>
                    {STATUS_LABEL[inv.status] || inv.status}
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "2px 0 0" }}>{clientName(inv)}</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    <span style={{ fontWeight: 700, color: "var(--fg)" }}>{fmt(inv.amount + (inv.tax || 0))}</span>
                    Â· {fmt(inv.paidAmount)} paid
                  </span>
                  {inv.outstanding > 0 && (
                    <span className="badge badge-amber" style={{ fontSize: 10 }}>{fmt(inv.outstanding)} due</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Invoice modal */}
      {createOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}>
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>New Invoice</h2>
              <button onClick={() => setCreateOpen(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {invoiceError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>{invoiceError}</div>
              )}
              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Client <span className="text-red-500">*</span></label>
                  <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="input">
                    <option value="">Select client</option>
                    {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Project</label>
                  <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="input">
                    <option value="">No project</option>
                    {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Invoice Number</label>
                  <input type="text" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Auto-generated if blank" className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                  </select>
                </div>
              </div>

              {/* Line items */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Line Items</label>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_64px_84px_36px] sm:grid-cols-[1fr_72px_96px_36px] gap-2 items-center">
                      <input type="text" placeholder="Description" value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="input" />
                      <input type="number" min={0} placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="input" />
                      <input type="number" min={0} placeholder="Rate" value={it.rate} onChange={(e) => updateItem(idx, "rate", e.target.value)} className="input" />
                      <button
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-40"
                        title="Remove item"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addItem} className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                  + Add item
                </button>
                {items.some((i) => i.description.trim()) && (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Subtotal: {fmt(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0))}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Amount</label>
                  <input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="From items" className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tax</label>
                  <input type="number" min={0} value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} placeholder="0" className="input" />
                </div>
                <div className="flex items-end">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 w-full pb-2.5">Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{fmt((Number(form.amount) || 0) + (Number(form.tax) || 0))}</span></p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Issue Date</label>
                  <input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Due Date</label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional" className="input" style={{ resize: "none" }} />
              </div>
            </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleCreate} disabled={savingInvoice} className="btn btn-primary">
                {savingInvoice ? "Creating..." : "Create Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment modal */}
      {payInvoice && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPayInvoice(null); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>Record Payment</h2>
              <button onClick={() => setPayInvoice(null)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                {payInvoice.invoiceNumber} Â· {fmt(payInvoice.amount + (payInvoice.tax || 0))} total Â· {fmt(payInvoice.paidAmount)} paid
              </p>
              {paymentError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>{paymentError}</div>
              )}
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Amount <span className="text-red-500">*</span></label>
                <input type="number" min={0} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Date</label>
                  <input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Method</label>
                  <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} className="input">
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Transaction ID</label>
                <input type="text" value={payForm.transactionId} onChange={(e) => setPayForm({ ...payForm, transactionId: e.target.value })} placeholder="Optional reference" className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Note</label>
                <input type="text" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} placeholder="Optional" className="input" />
              </div>
            </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setPayInvoice(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={handlePayment} disabled={savingPayment} className="btn btn-primary">
                {savingPayment ? "Recording..." : "Record Payment"}
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
              <h2>Delete Invoice</h2>
              <button onClick={() => { setDeletingId(null); setDeleteError(""); }} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                This permanently deletes the invoice and its payment ledger. This cannot be undone.
              </p>
              {deleteError && (
                <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">{deleteError}</div>
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

  function addItem() {
    setItems([...items, { ...emptyItem }]);
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, field: "description" | "quantity" | "rate", value: string) {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: field === "description" ? value : Number(value) } : it)));
  }
}

function InvoiceRow({
  inv,
  canManage,
  clientName,
  onPay,
  onCancel,
  onDelete,
  onDeletePayment,
}: {
  inv: InvoiceRecord;
  canManage: boolean;
  clientName: string;
  onPay: (inv: InvoiceRecord) => void;
  onCancel: (inv: InvoiceRecord) => void;
  onDelete: (inv: InvoiceRecord) => void;
  onDeletePayment: (p: Payment) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cancelled = inv.status === "cancelled";
  return (
    <>
      <tr className={cancelled ? "opacity-60" : ""}>
        <td>
          <button onClick={() => setExpanded(!expanded)} className="font-semibold text-zinc-900 dark:text-zinc-50 hover:text-indigo-600 dark:hover:text-indigo-400 text-left" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            {inv.invoiceNumber}
            {inv.items && inv.items.length > 0 && <span className="ml-1.5 text-xs text-zinc-400">â–¾</span>}
          </button>
          {inv.items && inv.items.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[180px]">
              {inv.items.map((i) => i.description).join(", ")}
            </p>
          )}
        </td>
        <td>{clientName}</td>
        <td className="text-xs">
          <div>Issued {fmtDate(inv.issueDate)}</div>
          {inv.dueDate && <div className="text-zinc-400 dark:text-zinc-500">Due {fmtDate(inv.dueDate)}</div>}
        </td>
        <td style={{ textAlign: "right" }} className="font-semibold text-zinc-900 dark:text-zinc-50">{fmt(inv.amount + (inv.tax || 0))}</td>
        <td style={{ textAlign: "right" }} className="text-emerald-600 dark:text-emerald-400">{fmt(inv.paidAmount)}</td>
        <td style={{ textAlign: "right" }} className={`font-semibold ${inv.outstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`}>{fmt(inv.outstanding)}</td>
        <td>
          <span className={`badge ${STATUS_BADGE[inv.status] || "badge-gray"} ${cancelled ? "line-through" : ""}`}>
            {STATUS_LABEL[inv.status] || inv.status}
          </span>
        </td>
        <td>
          <div className="flex items-center justify-end gap-1.5">
            {canManage && inv.status !== "cancelled" && inv.status !== "paid" && (
              <button onClick={() => onPay(inv)} className="btn btn-primary btn-sm" title="Record payment">
                Pay
              </button>
            )}
            {canManage && inv.status !== "cancelled" && (
              <button onClick={() => onCancel(inv)} className="btn btn-ghost btn-sm" title="Cancel invoice">
                Cancel
              </button>
            )}
            {canManage && (
              <button onClick={() => onDelete(inv)} className="icon-btn danger" title="Delete invoice">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && inv.payments.length > 0 && (
        <tr>
          <td colSpan={8} className="!pb-4">
            <div className="ml-2 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 space-y-1.5">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Payment History</p>
              {inv.payments.map((p) => (
                <div key={p._id} className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(p.amount)}</span>{" "}
                    via {PAYMENT_METHOD_LABEL[p.method] || p.method} on {fmtDate(p.date)}
                    {p.transactionId ? ` Â· Ref: ${p.transactionId}` : ""}
                    {p.note ? ` â€” ${p.note}` : ""}
                  </span>
                  {canManage && (
                    <button onClick={() => onDeletePayment(p)} className="p-1 rounded text-zinc-400 hover:text-red-500 transition" title="Remove payment">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
