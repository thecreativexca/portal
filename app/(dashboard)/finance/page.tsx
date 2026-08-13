"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PageShell, PageHeader, LoadingCenter, FinanceNav } from "@/components/portal";

const ALLOWED_ROLES = ["ceo", "accounts", "hr"];

const COLORS = {
  indigo: "#4f46e5",
  emerald: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString() : "â€”";

interface Overview {
  kpis: {
    totalInvoiced: number;
    totalCollected: number;
    outstanding: number;
    overdueAmount: number;
    cashThisMonth: number;
    totalCashReceived: number;
    expensesThisMonth: number;
    totalExpenses: number;
    payrollPending: number;
    payrollThisMonth: number;
  };
  outstandingInvoices: OutstandingInvoice[];
}

interface OutstandingInvoice {
  _id: string;
  invoiceNumber: string;
  amount: number;
  tax: number;
  paidAmount: number;
  outstanding: number;
  dueDate?: string;
  overdue: boolean;
  daysOverdue: number;
  clientName: string;
}

const chartTooltipStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-strong)",
  borderRadius: "10px",
  color: "var(--fg)",
  fontSize: "12px",
  boxShadow: "var(--shadow-md)",
};

export default function FinancePage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;

  const [overview, setOverview] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [profit, setProfit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role && !ALLOWED_ROLES.includes(role))
      redirect("/");
  }, [authStatus, role]);

  useEffect(() => {
    if (!role || !ALLOWED_ROLES.includes(role)) return;
    let cancelled = false;

    (async () => {
      try {
        const [ov, rev, prof] = await Promise.all([
          fetch("/api/finance/overview").then((r) => r.json()),
          fetch("/api/finance/revenue?months=6").then((r) => r.json()),
          fetch("/api/finance/profit").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setRevenue(rev?.series || []);
        setProfit(prof?.series || []);
      } catch (err) {
        console.error("Failed to fetch finance data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role]);

  if (authStatus === "loading") {
    return <LoadingCenter />;
  }

  const k = overview?.kpis;

  return (
    <PageShell>
      <PageHeader
        title="Finance"
        description="Revenue, collections, expenses, and payroll at a glance"
        badge={!loading && k ? <span className="count-chip">{fmt(k.cashThisMonth ?? 0)} this month</span> : undefined}
      />

      <FinanceNav />

      {/* KPI strip */}
      <div className="summary-strip">
        <KpiTile label="Total Invoiced" value={fmt(k?.totalInvoiced ?? 0)} tone="blue" icon="invoiced" />
        <KpiTile label="Cash Collected" value={fmt(k?.totalCollected ?? 0)} tone="green" icon="collected" />
        <KpiTile label="Outstanding" value={fmt(k?.outstanding ?? 0)} tone={k?.outstanding ? "amber" : "green"} icon="outstanding" />
        <KpiTile label="Overdue" value={fmt(k?.overdueAmount ?? 0)} tone={k?.overdueAmount ? "rose" : "blue"} icon="overdue" />
        <KpiTile label="Expenses (Month)" value={fmt(k?.expensesThisMonth ?? 0)} tone="purple" icon="expenses" />
        <KpiTile label="Payroll Pending" value={fmt(k?.payrollPending ?? 0)} tone="amber" icon="payroll" />
        <KpiTile label="Cash Received (Month)" value={fmt(k?.cashThisMonth ?? 0)} tone="green" icon="cash" />
        <KpiTile label="Total Expenses" value={fmt(k?.totalExpenses ?? 0)} tone="blue" icon="expenses" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue report */}
        <div className="card">
          <div className="card-header">
            <h2>Revenue Report</h2>
            <span className="count-chip">Last 6 months</span>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="skeleton h-64 rounded-lg" />
            ) : revenue.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 20px" }}>
                <p style={{ fontWeight: 600, color: "var(--fg)" }}>No revenue data yet</p>
                <p>Invoices and payments will appear here.</p>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "var(--bg-card2)" }} />
                    <Legend formatter={(value) => <span className="text-xs text-zinc-400">{value}</span>} />
                    <Bar dataKey="invoiced" name="Invoiced" fill={COLORS.indigo} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" name="Collected" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Profit report */}
        <div className="card">
          <div className="card-header">
            <h2>Profit Report</h2>
            <span className="count-chip">Cash basis</span>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="skeleton h-64 rounded-lg" />
            ) : profit.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 20px" }}>
                <p style={{ fontWeight: 600, color: "var(--fg)" }}>No profit data yet</p>
                <p>Revenue and expense trends will show here.</p>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={profit}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "var(--bg-card2)" }} />
                    <Legend formatter={(value) => <span className="text-xs text-zinc-400">{value}</span>} />
                    <Bar dataKey="revenue" name="Revenue" fill={COLORS.indigo} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
                    <Line dataKey="profit" name="Profit" type="monotone" stroke={COLORS.emerald} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Outstanding alerts */}
      <div className="card">
        <div className="card-header">
          <h2>Outstanding Invoices</h2>
          <Link href="/invoices" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }}>
            View all invoices
          </Link>
        </div>
        {loading ? (
          <div className="skeleton h-40 m-5 rounded-lg" />
        ) : !overview?.outstandingInvoices?.length ? (
          <div className="empty-state">
            <span className="icon">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </span>
            <p>No outstanding invoices</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Due</th>
                  <th style={{ textAlign: "right" }}>Outstanding</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.outstandingInvoices.map((inv) => (
                  <tr key={inv._id}>
                    <td>
                      <Link href="/invoices" style={{ fontWeight: 600, color: "var(--fg)", textDecoration: "none" }}>
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td>{inv.clientName}</td>
                    <td>
                      {fmtDate(inv.dueDate)}
                      {inv.overdue && (
                        <span className="badge badge-rose ml-2">{inv.daysOverdue}d overdue</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--fg)" }}>
                      {fmt(inv.outstanding)}
                    </td>
                    <td>
                      {inv.overdue ? (
                        <span className="badge badge-rose"><span className="dot dot-rose" style={{ width: 6, height: 6 }} />Overdue</span>
                      ) : (
                        <span className="badge badge-amber"><span className="dot dot-amber" style={{ width: 6, height: 6 }} />Partially Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function KpiTile({
  label,
  value,
  tone = "blue",
  icon,
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "amber" | "rose" | "purple";
  icon?: string;
}) {
  const tile = `tile tile-sm tile-${tone}`;
  const svg = {
    invoiced: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />,
    collected: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />,
    outstanding: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    overdue: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />,
    expenses: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    payroll: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />,
    cash: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  } as Record<string, React.ReactNode>;
  return (
    <div className="summary-item">
      <span className={tile}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          {svg[icon || "invoiced"]}
        </svg>
      </span>
      <div className="min-w-0">
        <p className="summary-num truncate">{value}</p>
        <p className="summary-label">{label}</p>
      </div>
    </div>
  );
}
