"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ClientFormModal, {
  ClientRecord,
  UserOption,
} from "@/components/ClientFormModal";

const ALLOWED_ROLES = ["ceo", "hr", "project_manager", "team_lead", "accounts"];

const STATUS_BADGE: Record<string, string> = {
  lead: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  active:
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  completed:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  "on-hold":
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
};

const STATUS_LABEL: Record<string, string> = {
  lead: "Lead",
  active: "Active",
  completed: "Completed",
  "on-hold": "On Hold",
};

const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  sent: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  partially_paid:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  paid: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  overdue: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  cancelled: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 line-through",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
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

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString() : "—";

interface Payment {
  _id?: string;
  amount: number;
  date: string;
  method: string;
  note?: string;
  recordedBy?: { _id: string; fullName: string; name: string; email: string };
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  status: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  payments: Payment[];
  clientId: { _id: string; clientName: string };
}

interface Project {
  _id: string;
  projectName: string;
  description?: string;
  status: string;
}

interface ClientStats {
  projectsCount: number;
  invoicesCount: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
}

export default function ClientDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accountManagers, setAccountManagers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Invoice create form
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: "",
    amount: "",
    issueDate: "",
    dueDate: "",
    status: "draft",
    notes: "",
  });
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    date: "",
    method: "bank_transfer",
    note: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
    if (authStatus === "authenticated" && role && !ALLOWED_ROLES.includes(role))
      router.push("/");
  }, [authStatus, role, router]);

  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setClient(data.client);
      setStats(data.stats);
    } catch {
      router.push("/clients");
    }
  }, [clientId, router]);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch {}
  }, [clientId]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {}
  }, [clientId]);

  const fetchAccountManagers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?status=active&pageSize=200");
      if (res.ok) {
        const data = await res.json();
        setAccountManagers(data.users || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (clientId && role && ALLOWED_ROLES.includes(role)) {
      Promise.all([fetchClient(), fetchInvoices(), fetchProjects(), fetchAccountManagers()]).finally(
        () => setLoading(false)
      );
    }
  }, [clientId, role, fetchClient, fetchInvoices, fetchProjects, fetchAccountManagers]);

  const handleDelete = async () => {
    setDeleteError("");
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete client");
        return;
      }
      router.push("/clients");
    } catch (err) {
      console.error(err);
      setDeleteError("Something went wrong");
    }
  };

  const openInvoiceModal = () => {
    setInvoiceForm({
      invoiceNumber: "",
      amount: "",
      issueDate: "",
      dueDate: "",
      status: "draft",
      notes: "",
    });
    setInvoiceError("");
    setInvoiceOpen(true);
  };

  const handleCreateInvoice = async () => {
    setSavingInvoice(true);
    setInvoiceError("");
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...invoiceForm, clientId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create invoice");
      }
      setInvoiceOpen(false);
      Promise.all([fetchInvoices(), fetchClient()]);
    } catch (err: unknown) {
      setInvoiceError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSavingInvoice(false);
    }
  };

  const openPaymentModal = (inv: Invoice) => {
    setPaymentInvoice(inv);
    setPaymentForm({
      amount: String(Math.max(0, inv.amount - inv.paidAmount)),
      date: new Date().toISOString().slice(0, 10),
      method: "bank_transfer",
      note: "",
    });
    setPaymentError("");
  };

  const handleRecordPayment = async () => {
    if (!paymentInvoice) return;
    setSavingPayment(true);
    setPaymentError("");
    try {
      const res = await fetch(`/api/invoices/${paymentInvoice._id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to record payment");
      }
      setPaymentInvoice(null);
      Promise.all([fetchInvoices(), fetchClient()]);
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleCancelInvoice = async (inv: Invoice) => {
    if (!window.confirm(`Cancel invoice ${inv.invoiceNumber}?`)) return;
    try {
      const res = await fetch(`/api/invoices/${inv._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        Promise.all([fetchInvoices(), fetchClient()]);
      }
    } catch {}
  };

  const handleDeleteInvoice = async (inv: Invoice) => {
    if (!window.confirm(`Delete invoice ${inv.invoiceNumber}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/invoices/${inv._id}`, { method: "DELETE" });
      if (res.ok) {
        Promise.all([fetchInvoices(), fetchClient()]);
      }
    } catch {}
  };

  // Gate mutation actions to roles that actually hold the write permissions.
  const canManageClient = role === "ceo" || role === "project_manager";
  const canManageInvoices =
    role === "ceo" || role === "project_manager" || role === "accounts";

  const am = client?.accountManagerId as UserOption | undefined;
  const contractEnd = client?.contractEndDate;
  const daysLeft = contractEnd
    ? Math.ceil(
        (new Date(contractEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  if (authStatus === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link href="/clients" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-2 inline-block">
          &larr; Back to Clients
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {client.clientName}
              </h1>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
                STATUS_BADGE[client.status] || STATUS_BADGE.lead
              }`}>
                {STATUS_LABEL[client.status] || client.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {[client.legalName, client.industry].filter(Boolean).join(" · ") ||
                "Client"}
            </p>
          </div>
          {canManageClient && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                Edit
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Financial stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total Projects" value={String(stats?.projectsCount ?? 0)} />
        <StatTile label="Total Invoices" value={String(stats?.invoicesCount ?? 0)} />
        <StatTile
          label="Total Payments Received"
          value={fmt(stats?.totalPaid ?? 0)}
          tone="positive"
        />
        <StatTile
          label="Outstanding Amount"
          value={fmt(stats?.outstanding ?? 0)}
          tone={stats?.outstanding ? "warning" : "positive"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Overview */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contract summary */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
              Contract Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Contract Value</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {client.contractValue !== undefined && client.contractValue !== null
                    ? fmt(client.contractValue)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Start Date</p>
                <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {fmtDate(client.contractStartDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">End Date</p>
                <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {fmtDate(client.contractEndDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Renewal Date</p>
                <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {fmtDate(client.renewalDate)}
                </p>
              </div>
            </div>
            {daysLeft !== null && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 text-sm">
                <span className="text-indigo-600 dark:text-indigo-300 font-medium">
                  {daysLeft >= 0
                    ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`
                    : "Contract expired"}
                </span>
              </div>
            )}
          </div>

          {/* Account manager */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
              Assigned Account Manager
            </h3>
            {am ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                  {(am.fullName || am.name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {am.fullName || am.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{am.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No account manager assigned</p>
            )}
          </div>

          {/* Contact / company info */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
              Company & Contact
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <DetailRow label="Website" value={client.website} link />
              <DetailRow label="GST Number" value={client.gstNumber} />
              <DetailRow label="Address" value={[client.address, client.city, client.state, client.country].filter(Boolean).join(", ")} />
              <DetailRow label="Primary Contact" value={client.primaryContactName} />
              <DetailRow label="Contact Email" value={client.primaryContactEmail} />
              <DetailRow label="Contact Phone" value={client.primaryContactPhone} />
            </div>
            {client.notes && (
              <div className="mt-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 text-sm text-zinc-600 dark:text-zinc-300">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">Notes: </span>
                {client.notes}
              </div>
            )}
          </div>

          {/* Projects */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Linked Projects ({projects.length})
              </h3>
              <Link href={`/projects?clientId=${clientId}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                View all projects
              </Link>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-zinc-400">No projects linked to this client</p>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <Link
                    key={p._id}
                    href={`/projects/${p._id}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{p.projectName}</span>
                    <span className="text-xs capitalize text-zinc-500 dark:text-zinc-400">
                      {p.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Invoices */}
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Invoices ({invoices.length})
              </h2>
              {canManageInvoices && (
                <button
                  onClick={openInvoiceModal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Invoice
                </button>
              )}
            </div>
            {invoices.length === 0 ? (
              <p className="px-5 py-8 text-sm text-zinc-400 text-center">
                No invoices yet
              </p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[420px] overflow-y-auto">
                {invoices.map((inv) => (
                  <div key={inv._id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Issued {fmtDate(inv.issueDate)}
                          {inv.dueDate && ` · Due ${fmtDate(inv.dueDate)}`}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        INVOICE_STATUS_BADGE[inv.status] || INVOICE_STATUS_BADGE.draft
                      }`}>
                        {INVOICE_STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <div className="text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium text-zinc-900 dark:text-zinc-50">
                          {fmt(inv.amount)}
                        </span>{" "}
                        <span className="text-emerald-600 dark:text-emerald-400">
                          · Paid {fmt(inv.paidAmount)}
                        </span>
                      </div>
                      {canManageInvoices && (
                        <div className="flex items-center gap-1.5">
                          {inv.status !== "cancelled" && inv.status !== "paid" && (
                            <button
                              onClick={() => openPaymentModal(inv)}
                              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white transition"
                            >
                              Record Payment
                            </button>
                          )}
                          {inv.status !== "cancelled" && (
                            <button
                              onClick={() => handleCancelInvoice(inv)}
                              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteInvoice(inv)}
                            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {inv.payments.length > 0 && (
                      <div className="mt-2 space-y-1 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700">
                        {inv.payments.map((p, i) => (
                          <div key={p._id || i} className="text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                              {fmt(p.amount)}
                            </span>{" "}
                            via {PAYMENT_METHOD_LABEL[p.method] || p.method} on {fmtDate(p.date)}
                            {p.note && ` — ${p.note}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total invoiced */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Invoiced (excl. cancelled)</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {fmt(stats?.totalInvoiced ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <ClientFormModal
        open={editOpen}
        client={client}
        accountManagers={accountManagers}
        onClose={() => setEditOpen(false)}
        onSaved={fetchClient}
      />

      {/* New Invoice modal */}
      {invoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              New Invoice
            </h2>
            {invoiceError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {invoiceError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoiceForm.invoiceNumber}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                  placeholder="Auto-generated if blank"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={invoiceForm.issueDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, issueDate: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Status
                </label>
                <select
                  value={invoiceForm.status}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })}
                  className={inputCls}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={invoiceForm.notes}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Optional"
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setInvoiceOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateInvoice}
                disabled={savingInvoice}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {savingInvoice ? "Creating..." : "Create Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment modal */}
      {paymentInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
              Record Payment
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              {paymentInvoice.invoiceNumber} · {fmt(paymentInvoice.amount)} total ·{" "}
              {fmt(paymentInvoice.paidAmount)} paid
            </p>
            {paymentError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {paymentError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Method
                  </label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                    className={inputCls}
                  >
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                  placeholder="Optional reference"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setPaymentInvoice(null)}
                className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={savingPayment}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {savingPayment ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Delete Client
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              This will remove the client from lists. Its projects and invoices
              are kept for the audit trail.
            </p>
            {deleteError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  link,
}: {
  label: string;
  value?: string;
  link?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      {link ? (
        <a
          href={/^https?:\/\//.test(value) ? value : `https://${value}`}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 font-medium text-indigo-600 dark:text-indigo-400 hover:underline break-all"
        >
          {value}
        </a>
      ) : (
        <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50 break-all">
          {value}
        </p>
      )}
    </div>
  );
}
