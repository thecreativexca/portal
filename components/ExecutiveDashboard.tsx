"use client";

import { useCallback } from "react";
import Link from "next/link";
import { apiFetch, useApi } from "@/lib/client";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "@/components/ThemeProvider";

/* --------------------------------------------------------------------------
 * Types (mirror of the /api/dashboard/ceo responses)
 * ------------------------------------------------------------------------ */

interface Kpis {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  absentToday: number;
  onLeaveToday: number;
  activeClients: number;
  totalProjects: number;
  projectsAtRisk: number;
  projectsOverdue: number;
  tasksDueToday: number;
  overdueTasks: number;
  revenueThisMonth: number;
  revenueThisYear: number;
  outstandingAmount: number;
  outstandingCount: number;
  expensesThisMonth: number;
  payrollThisMonth: number;
  netProfitThisMonth: number;
  averageUtilization: number;
}

interface TopPerformer {
  userId: string;
  fullName: string;
  role: string;
  productivityScore: number;
  projectUtilization: number;
  tasksCompleted: number;
  attendancePercentage: number;
}

interface TopClient {
  clientId: string | null;
  clientName: string;
  revenue: number;
  invoiceCount: number;
}

interface ActivityItem {
  _id: string;
  action: string;
  details: string;
  timestamp: string;
  userName: string;
}

interface CeoOverview {
  kpis: Kpis;
  topPerformingEmployees: TopPerformer[];
  topRevenueClients: TopClient[];
  recentActivity: ActivityItem[];
}

interface ChartPoint {
  month: string;
  [key: string]: string | number;
}

interface ChartsData {
  monthlyRevenueTrend: ChartPoint[];
  expenseTrend: ChartPoint[];
  projectCompletionTrend: ChartPoint[];
  employeeGrowth: ChartPoint[];
  clientAcquisition: ChartPoint[];
}

interface DeadlineTask {
  _id: string;
  title: string;
  dueDate: string;
  priority: string;
  assigneeName: string;
  projectName: string | null;
}

interface DeadlineMilestone {
  _id: string;
  title: string;
  dueDate: string;
  projectName: string;
}

interface BriefingData {
  delayedProjects: {
    _id: string;
    projectName: string;
    status: string;
    endDate: string | null;
    overdueMilestones: number;
  }[];
  overdueInvoices: {
    _id: string;
    invoiceNumber: string;
    clientName: string;
    outstanding: number;
    dueDate: string | null;
  }[];
  absentEmployees: {
    _id: string;
    fullName: string;
    role: string;
    designation: string | null;
  }[];
  upcomingDeadlines: { tasks: DeadlineTask[]; milestones: DeadlineMilestone[] };
  newLeads: {
    _id: string;
    companyName: string;
    estimatedValue: number | null;
    stage: string;
    createdAt: string;
  }[];
  pendingApprovals: {
    _id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
    userName: string;
  }[];
}

/* --------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString() : "—";

function timeAgo(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function monthLabel(key: unknown): string {
  if (typeof key !== "string") return "";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
  });
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_PHRASES: Record<string, string> = {
  DELETE_LEAD: "deleted a lead",
  CREATE_LEAD: "created a lead",
  UPDATE_LEAD: "updated a lead",
  MOVE_LEAD: "moved a lead",
  DELETE_OPPORTUNITY: "deleted an opportunity",
  CREATE_OPPORTUNITY: "created an opportunity",
  UPDATE_OPPORTUNITY: "updated an opportunity",
  MOVE_OPPORTUNITY: "moved an opportunity",
  CREATE_PROJECT: "created a project",
  UPDATE_PROJECT: "updated a project",
  CREATE_TASK: "created a task",
  UPDATE_TASK: "updated a task",
  CREATE_USER: "added a user",
  UPDATE_USER: "updated a user",
};

function formatActivityAction(action: string) {
  return ACTION_PHRASES[action] ?? formatLabel(action).toLowerCase();
}

function chartMax(data: ChartPoint[], key: string) {
  if (!data?.length) return 0;
  return Math.max(0, ...data.map((d) => Number(d[key]) || 0));
}

function chartHasValues(data: ChartPoint[] | undefined, keys: string[]) {
  if (!data?.length) return false;
  return data.some((row) => keys.some((k) => Number(row[k]) > 0));
}

function integerYDomain(data: ChartPoint[], key: string): [number, number] {
  const max = chartMax(data, key);
  if (max <= 0) return [0, 4];
  return [0, Math.max(max + 1, Math.ceil(max * 1.2))];
}

function moneyYDomain(data: ChartPoint[], key: string): [number, number | string] {
  const max = chartMax(data, key);
  if (max <= 0) return [0, 1000];
  return [0, Math.ceil(max * 1.15)];
}

/* --------------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------------ */

export default function ExecutiveDashboard() {
  const { darkMode } = useTheme();

  const fetcher = useCallback(async () => {
    const [ov, ch, br] = await Promise.all([
      apiFetch<CeoOverview>("/api/dashboard/ceo"),
      apiFetch<ChartsData>("/api/dashboard/ceo/charts"),
      apiFetch<BriefingData>("/api/dashboard/ceo/briefing"),
    ]);
    return { overview: ov, charts: ch, briefing: br };
  }, []);

  const { data, loading, error, refresh } = useApi(fetcher, []);
  const overview = data?.overview ?? null;
  const charts = data?.charts ?? null;
  const briefing = data?.briefing ?? null;

  if (loading) {
    return <LoadingState />;
  }
  if (error || !overview) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Couldn’t load the executive dashboard right now. Please try again.
        <div className="mt-4">
          <button
            onClick={refresh}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { kpis } = overview;
  const axisColor = darkMode ? "#8e9ab2" : "#6b7fa0";
  const gridColor = darkMode ? "rgba(255,255,255,0.06)" : "rgba(80,140,220,0.10)";

  const cards = buildKpiCards(kpis);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Refresh */}
      <div className="flex items-center justify-end">
        <button
          onClick={refresh}
          className="btn btn-ghost btn-sm"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 9,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-card)",
            color: "var(--fg-muted)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
            fontFamily: "inherit",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh data
        </button>
      </div>

      {/* KPI grid */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {cards.map((c, i) => (
          <KpiCard key={c.label} {...c} delay={i} />
        ))}
      </div>

      {/* Charts grid */}
      <div className="exec-charts-grid">
        <ChartCard
          title="Monthly Revenue"
          subtitle="Last 6 months · cash collected"
          empty={!chartHasValues(charts?.monthlyRevenueTrend, ["revenue"])}
        >
          <BarChart data={charts?.monthlyRevenueTrend || []}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis domain={moneyYDomain(charts?.monthlyRevenueTrend || [], "revenue")} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtINR(Number(v))} width={72} />
            <Tooltip contentStyle={tooltipStyle(darkMode)} cursor={{ fill: darkMode ? "rgba(255,255,255,0.03)" : "rgba(40,120,240,0.06)" }} formatter={(v) => [fmtINR(Number(v)), "Revenue"]} labelFormatter={monthLabel} />
            <Bar dataKey="revenue" fill="#2878f0" radius={[5, 5, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Expense Trend"
          subtitle="Last 6 months"
          empty={!chartHasValues(charts?.expenseTrend, ["expenses"])}
        >
          <BarChart data={charts?.expenseTrend || []}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis domain={moneyYDomain(charts?.expenseTrend || [], "expenses")} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtINR(Number(v))} width={72} />
            <Tooltip contentStyle={tooltipStyle(darkMode)} cursor={{ fill: darkMode ? "rgba(255,255,255,0.03)" : "rgba(40,120,240,0.06)" }} formatter={(v) => [fmtINR(Number(v)), "Expenses"]} labelFormatter={monthLabel} />
            <Bar dataKey="expenses" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Project Completion"
          subtitle="Milestones completed per month"
          empty={!chartHasValues(charts?.projectCompletionTrend, ["completed"])}
        >
          <BarChart data={charts?.projectCompletionTrend || []}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} domain={integerYDomain(charts?.projectCompletionTrend || [], "completed")} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle(darkMode)} cursor={{ fill: darkMode ? "rgba(255,255,255,0.03)" : "rgba(40,120,240,0.06)" }} formatter={(v) => [Number(v), "Completed"]} labelFormatter={monthLabel} />
            <Bar dataKey="completed" fill="#8b5cf6" radius={[5, 5, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Employee Growth"
          subtitle="Active headcount"
          empty={!chartHasValues(charts?.employeeGrowth, ["total"])}
        >
          <LineChart data={charts?.employeeGrowth || []}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} domain={integerYDomain(charts?.employeeGrowth || [], "total")} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle(darkMode)} formatter={(v) => [Number(v), "Employees"]} labelFormatter={monthLabel} />
            <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ChartCard>

        <ChartCard
          title="Client Acquisition"
          subtitle="New clients per month"
          empty={!chartHasValues(charts?.clientAcquisition, ["acquired"])}
        >
          <BarChart data={charts?.clientAcquisition || []}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} domain={integerYDomain(charts?.clientAcquisition || [], "acquired")} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle(darkMode)} cursor={{ fill: darkMode ? "rgba(255,255,255,0.03)" : "rgba(40,120,240,0.06)" }} formatter={(v) => [Number(v), "Clients"]} labelFormatter={monthLabel} />
            <Bar dataKey="acquired" fill="#38bdf8" radius={[5, 5, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ChartCard>

        <div className="card card-hover exec-panel">
          <div className="exec-panel-header">
            <div>
              <h3 className="exec-panel-title">Average Utilization</h3>
              <p className="exec-panel-meta">Logged vs available hours — this month</p>
            </div>
          </div>
          <div className="util-card-body">
            <p style={{ fontSize: 44, fontWeight: 800, color: "var(--primary)", letterSpacing: "-0.04em", lineHeight: 1, margin: 0 }}>
              {Math.round(kpis.averageUtilization)}%
            </p>
            <div style={{ marginTop: 16, height: 8, borderRadius: 99, background: "var(--bg-card2)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, kpis.averageUtilization)}%`,
                  background: "linear-gradient(90deg, var(--primary), var(--accent))",
                  borderRadius: 99,
                  transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
            <p style={{ marginTop: 12, fontSize: "12px", color: "var(--fg-muted)", lineHeight: 1.5 }}>
              Team capacity used across active employees
            </p>
          </div>
        </div>
      </div>

      <div className="exec-insights-grid">
        {briefing && <AlertsPanel briefing={briefing} />}
        <RecentActivity items={overview.recentActivity} />
      </div>

      <div className="exec-rankings-grid">
        <TopPerformers items={overview.topPerformingEmployees} />
        <TopClients items={overview.topRevenueClients} />
      </div>

      {/* Quick actions */}
      <QuickActions />
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------------ */

/* --------------------------------------------------------------------------
 * KpiCard — uses the theme's stat-card design system
 * ------------------------------------------------------------------------ */

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "indigo" | "emerald" | "amber" | "red" | "default";
  href?: string;
  icon: React.ReactNode;
}

const toneMap: Record<string, { tile: string; valueColor: string }> = {
  indigo:  { tile: "tile tile-blue",   valueColor: "var(--primary)" },
  emerald: { tile: "tile tile-green",  valueColor: "var(--accent-green)" },
  amber:   { tile: "tile tile-amber",  valueColor: "var(--accent-amber)" },
  red:     { tile: "tile tile-rose",   valueColor: "var(--accent-rose)" },
  default: { tile: "tile tile-sm",     valueColor: "var(--fg)" },
};

function KpiCard({ label, value, sub, tone = "default", href, icon, delay = 0 }: KpiCardProps & { delay?: number }) {
  const { tile, valueColor } = toneMap[tone] ?? toneMap.default;

  const inner = (
    <div
      className="stat-card stat-card-enter card-hover"
      style={{ cursor: href ? "pointer" : "default", animationDelay: `${delay * 0.03 + 0.04}s` }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="stat-label">{label}</p>
          <p className="stat-value" style={{ fontSize: 26, color: valueColor }}>{value}</p>
          {sub && <p className="stat-sub">{sub}</p>}
        </div>
        <div className={`${tile}`} style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="stat-card-link">{inner}</Link>;
  }
  return inner;
}

function ChartCard({
  title,
  subtitle,
  children,
  empty = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="card card-hover exec-panel">
      <div className="exec-panel-header">
        <div>
          <h3 className="exec-panel-title">{title}</h3>
          <p className="exec-panel-meta">{subtitle}</p>
        </div>
      </div>
      <div style={{ padding: "12px 16px 16px" }}>
        {empty ? (
          <div className="chart-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <span>No data for this period</span>
          </div>
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function tooltipStyle(dark: boolean) {
  return {
    background: dark ? "var(--bg-card2,#1a1b22)" : "#ffffff",
    border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(80,140,220,0.14)"}`,
    borderRadius: "10px",
    color: dark ? "#e2e8f4" : "#0c1929",
    fontSize: "12px",
    boxShadow: dark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(14,59,148,0.10)",
  };
}

/* --------------------------------------------------------------------------
 * KPI card configuration
 * ------------------------------------------------------------------------ */

function buildKpiCards(k: Kpis): KpiCardProps[] {
  return [
    {
      label: "Total Employees",
      value: k.totalEmployees,
      sub: `${k.activeEmployees} active`,
      tone: "indigo",
      href: "/users",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      label: "Present Today",
      value: k.presentToday,
      sub: `${k.absentToday} absent · ${k.onLeaveToday} on leave`,
      tone: "emerald",
      href: "/attendance",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Active Clients",
      value: k.activeClients,
      href: "/clients",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
        </svg>
      ),
    },
    {
      label: "Total Projects",
      value: k.totalProjects,
      href: "/projects",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM9.75 6.75h8.25M9.75 9.75h8.25m-8.25 3h8.25" />
        </svg>
      ),
    },
    {
      label: "Projects At Risk",
      value: k.projectsAtRisk,
      tone: "amber",
      href: "/projects",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
    },
    {
      label: "Projects Overdue",
      value: k.projectsOverdue,
      tone: "red",
      href: "/projects",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
    },
    {
      label: "Tasks Due Today",
      value: k.tasksDueToday,
      tone: "amber",
      href: "/tasks",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: "Overdue Tasks",
      value: k.overdueTasks,
      tone: "red",
      href: "/tasks",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Revenue This Month",
      value: fmtINR(k.revenueThisMonth),
      tone: "indigo",
      href: "/finance",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      ),
    },
    {
      label: "Net Profit This Month",
      value: fmtINR(k.netProfitThisMonth),
      tone: "emerald",
      href: "/finance",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      ),
    },
    {
      label: "Outstanding Invoices",
      value: fmtINR(k.outstandingAmount),
      sub: `${k.outstandingCount} invoices`,
      tone: "amber",
      href: "/invoices",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
    },
    {
      label: "Expenses This Month",
      value: fmtINR(k.expensesThisMonth),
      href: "/expenses",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm0 0h.008v.008h-.008v-.008z" />
        </svg>
      ),
    },
  ];
}

/* --------------------------------------------------------------------------
 * Alerts panel
 * ------------------------------------------------------------------------ */

function AlertsPanel({ briefing }: { briefing: BriefingData }) {
  const deadlineTotal =
    briefing.upcomingDeadlines.tasks.length + briefing.upcomingDeadlines.milestones.length;

  const sections: {
    id: string;
    title: string;
    count: number;
    href: string;
    severity: "critical" | "warning" | "info";
    items: { key: string; label: string; sub?: string }[];
  }[] = [
    {
      id: "delayed",
      title: "Delayed Projects",
      count: briefing.delayedProjects.length,
      href: "/projects",
      severity: "critical",
      items: briefing.delayedProjects.slice(0, 3).map((p) => ({
        key: p._id,
        label: p.projectName,
        sub: p.overdueMilestones
          ? `${p.overdueMilestones} overdue milestone(s)`
          : `Past due ${fmtDate(p.endDate)}`,
      })),
    },
    {
      id: "invoices",
      title: "Overdue Invoices",
      count: briefing.overdueInvoices.length,
      href: "/invoices",
      severity: "critical",
      items: briefing.overdueInvoices.slice(0, 3).map((i) => ({
        key: i._id,
        label: `${i.invoiceNumber} · ${i.clientName}`,
        sub: `${fmtINR(i.outstanding)} · due ${fmtDate(i.dueDate)}`,
      })),
    },
    {
      id: "absent",
      title: "Absent Employees",
      count: briefing.absentEmployees.length,
      href: "/attendance",
      severity: "warning",
      items: briefing.absentEmployees.slice(0, 3).map((u) => ({
        key: u._id,
        label: u.fullName,
        sub: u.designation || formatLabel(u.role),
      })),
    },
    {
      id: "deadlines",
      title: "Upcoming Deadlines",
      count: deadlineTotal,
      href: "/tasks",
      severity: "warning",
      items: [
        ...briefing.upcomingDeadlines.tasks.slice(0, 2).map((t) => ({
          key: t._id,
          label: t.title,
          sub: `Due ${fmtDate(t.dueDate)}${t.assigneeName ? ` · ${t.assigneeName}` : ""}`,
        })),
        ...briefing.upcomingDeadlines.milestones.slice(0, 2).map((m) => ({
          key: m._id,
          label: m.title,
          sub: `Milestone · ${m.projectName} · ${fmtDate(m.dueDate)}`,
        })),
      ],
    },
    {
      id: "leads",
      title: "New Leads",
      count: briefing.newLeads.length,
      href: "/crm",
      severity: "info",
      items: briefing.newLeads.slice(0, 3).map((l) => ({
        key: l._id,
        label: l.companyName,
        sub: l.estimatedValue ? fmtINR(l.estimatedValue) : formatLabel(l.stage),
      })),
    },
    {
      id: "approvals",
      title: "Pending Approvals",
      count: briefing.pendingApprovals.length,
      href: "/leaves",
      severity: "info",
      items: briefing.pendingApprovals.slice(0, 3).map((l) => ({
        key: l._id,
        label: `${l.userName} · ${formatLabel(l.leaveType)} leave`,
        sub: `${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}`,
      })),
    },
  ];

  const dotClass = (sev: string) =>
    sev === "critical" ? "tile-rose" : sev === "warning" ? "tile-amber" : "tile-blue";

  return (
    <div className="card exec-panel">
      <div className="exec-panel-header">
        <h3 className="exec-panel-title">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          Needs Attention
        </h3>
        <span className="badge badge-amber">Live</span>
      </div>
      <div>
        {sections.map((s) => (
          <div key={s.id} className="exec-alert-row">
            <div className="exec-alert-head">
              <Link href={s.href} className="exec-alert-title">
                <span className={`tile tile-xs ${dotClass(s.severity)}`} />
                {s.title}
              </Link>
              <span className="exec-alert-count">{s.count}</span>
            </div>
            {s.items.length > 0 && (
              <ul className="exec-alert-items">
                {s.items.map((it) => (
                  <li key={it.key} className="exec-alert-item">
                    <strong>{it.label}</strong>
                    {it.sub ? ` — ${it.sub}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Recent activity
 * ------------------------------------------------------------------------ */

function RecentActivity({ items }: { items: ActivityItem[] }) {
  const visible = items.slice(0, 12);

  return (
    <div className="card exec-panel">
      <div className="exec-panel-header">
        <h3 className="exec-panel-title">Recent Activity</h3>
        <Link href="/logs" className="exec-panel-link">View all</Link>
      </div>
      {visible.length === 0 ? (
        <p style={{ padding: "32px 20px", textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
          No activity yet
        </p>
      ) : (
        <ul className="exec-list exec-scroll-list">
          {visible.map((a) => (
            <li key={a._id} className="exec-list-item">
              <span className="exec-activity-dot" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", margin: 0, lineHeight: 1.4 }}>
                  <span style={{ color: "var(--primary)" }}>{a.userName}</span>
                  {" "}{formatActivityAction(a.action)}
                </p>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "3px 0 0", lineHeight: 1.4 }} className="truncate">
                  {a.details}
                </p>
              </div>
              <span className="exec-activity-time">{timeAgo(a.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Rankings
 * ------------------------------------------------------------------------ */

function TopPerformers({ items }: { items: TopPerformer[] }) {
  return (
    <div className="card exec-panel">
      <div className="exec-panel-header">
        <h3 className="exec-panel-title">Top Performers</h3>
        <p className="exec-panel-meta">By productivity score</p>
      </div>
      {items.length === 0 ? (
        <p style={{ padding: "28px 20px", textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
          No data yet
        </p>
      ) : (
        <ol className="exec-list">
          {items.map((p, i) => (
            <li key={p.userId} className="exec-list-item" style={{ alignItems: "center" }}>
              <span className={`exec-rank${i === 0 ? " exec-rank-top" : ""}`}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", margin: 0 }} className="truncate">
                  {p.fullName}
                </p>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "2px 0 0" }}>
                  {formatLabel(p.role)}
                </p>
              </div>
              <span className="exec-score">{p.productivityScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TopClients({ items }: { items: TopClient[] }) {
  return (
    <div className="card exec-panel">
      <div className="exec-panel-header">
        <h3 className="exec-panel-title">Top Revenue Clients</h3>
        <p className="exec-panel-meta">This year</p>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0 }}>No revenue yet</p>
          <p style={{ fontSize: 12, color: "var(--fg-subtle)", margin: "6px 0 0" }}>
            Revenue appears when invoices are paid
          </p>
        </div>
      ) : (
        <ol className="exec-list">
          {items.map((c, i) => (
            <li key={c.clientId || c.clientName} className="exec-list-item" style={{ alignItems: "center" }}>
              <span className={`exec-rank${i === 0 ? " exec-rank-top" : ""}`}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", margin: 0 }} className="truncate">
                  {c.clientName}
                </p>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "2px 0 0" }}>
                  {c.invoiceCount} invoice(s)
                </p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)", flexShrink: 0 }}>
                {fmtINR(c.revenue)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Quick actions
 * ------------------------------------------------------------------------ */

function QuickActions() {
  const actions = [
    { label: "View Projects",   href: "/projects",    tile: "tile-blue" },
    { label: "View Invoices",   href: "/invoices",    tile: "tile-amber" },
    { label: "Mark Attendance", href: "/attendance",  tile: "tile-green" },
    { label: "View Finance",    href: "/finance",     tile: "tile-cyan" },
    { label: "CRM Pipeline",    href: "/crm",         tile: "tile-purple" },
    { label: "Reports",         href: "/reports",     tile: "tile-rose" },
  ];
  return (
    <div className="card">
      <div className="card-header">
        <h2>Quick Actions</h2>
        <span className="count-chip">
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Shortcuts
        </span>
      </div>
      <div className="card-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="quick-action"
            >
              <span className={`tile tile-sm ${a.tile}`}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </span>
              <span>{a.label}</span>
              <svg className="qa-arrow" width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Loading state
 * ------------------------------------------------------------------------ */

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="stat-card">
            <div className="skeleton" style={{ height: 12, width: 80, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 28, width: 64 }} />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card">
            <div className="card-body">
              <div className="skeleton" style={{ height: 14, width: 120, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 180, borderRadius: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
