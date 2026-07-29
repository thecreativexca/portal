"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface DashboardStats {
  totalEmployees?: number;
  activeProjects?: number;
  pendingLeaves?: number;
  pendingTasks?: number;
  presentToday?: boolean;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {role === "ceo"
            ? "Company-wide overview and key metrics"
            : role === "manager"
            ? "Team performance and activity at a glance"
            : "Your personal overview"}
        </p>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 animate-pulse"
            >
              <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
              <div className="h-8 w-12 bg-zinc-200 dark:bg-zinc-700 rounded" />
            </div>
          ))}
        </div>
      ) : role === "ceo" ? (
        <CEODashboard stats={stats} />
      ) : role === "manager" ? (
        <ManagerDashboard stats={stats} />
      ) : (
        <EmployeeDashboard stats={stats} />
      )}

      {/* Quick Actions */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Quick Actions
          </h2>
        </div>
        <div className="p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickActionButton
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            label="Mark Attendance"
            href="/attendance"
          />
          <QuickActionButton
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.765.66-1.516 1.47-2.179 2.323m-3.002 4.07c-.41.783-.716 1.63-.898 2.527m-1.247 5.498a48.5 48.5 0 00.158 4.07c.078.393.278.754.564 1.026.286.272.654.443 1.047.5a46.568 46.568 0 014.152.414c.468.052.938.078 1.408.078 2.147 0 4.24-.326 6.22-.93.475-.146.904-.384 1.27-.696.366-.313.613-.708.716-1.147.218-.918.306-1.87.274-2.82m-7.61-2.62l.54-1.003m6.694-1.293a3.748 3.748 0 01-2.068 1.72c-.467.163-.977.243-1.488.243" />
              </svg>
            }
            label="View Tasks"
            href="/tasks"
          />
          <QuickActionButton
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            }
            label="Team Chat"
            href="/chat"
          />
        </div>
      </div>
    </div>
  );
}

function CEODashboard({ stats }: { stats: DashboardStats | null }) {
  const items = [
    {
      label: "Total Employees",
      value: stats?.totalEmployees ?? "—",
      icon: (
        <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
      color: "purple",
    },
    {
      label: "Active Projects",
      value: stats?.activeProjects ?? "—",
      icon: (
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM9.75 6.75h8.25M9.75 9.75h8.25m-8.25 3h8.25" />
        </svg>
      ),
      color: "blue",
    },
    {
      label: "Pending Leaves",
      value: stats?.pendingLeaves ?? "—",
      icon: (
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
      color: "amber",
    },
    {
      label: "Pending Leaves",
      value: stats?.pendingLeaves ?? "—",
      icon: (
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
      color: "amber",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Employees"
        value={stats?.totalEmployees ?? "—"}
        icon={
          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        }
        bgClass="bg-purple-100 dark:bg-purple-900/30"
      />
      <StatCard
        label="Active Projects"
        value={stats?.activeProjects ?? "—"}
        icon={
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM9.75 6.75h8.25M9.75 9.75h8.25m-8.25 3h8.25" />
          </svg>
        }
        bgClass="bg-blue-100 dark:bg-blue-900/30"
      />
      <StatCard
        label="Pending Leaves"
        value={stats?.pendingLeaves ?? "—"}
        icon={
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        }
        bgClass="bg-amber-100 dark:bg-amber-900/30"
      />
    </div>
  );
}

function ManagerDashboard({ stats }: { stats: DashboardStats | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Team Present Today"
        value={stats?.presentToday !== undefined ? (stats.presentToday ? "Yes" : "No") : "—"}
        icon={
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        bgClass="bg-emerald-100 dark:bg-emerald-900/30"
      />
      <StatCard
        label="Active Projects"
        value={stats?.activeProjects ?? "—"}
        icon={
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
        }
        bgClass="bg-blue-100 dark:bg-blue-900/30"
      />
      <StatCard
        label="Pending Tasks"
        value={stats?.pendingTasks ?? "—"}
        icon={
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.765.66-1.516 1.47-2.179 2.323m-3.002 4.07c-.41.783-.716 1.63-.898 2.527m-1.247 5.498a48.5 48.5 0 00.158 4.07c.078.393.278.754.564 1.026.286.272.654.443 1.047.5a46.568 46.568 0 014.152.414c.468.052.938.078 1.408.078 2.147 0 4.24-.326 6.22-.93.475-.146.904-.384 1.27-.696.366-.313.613-.708.716-1.147.218-.918.306-1.87.274-2.82m-7.61-2.62l.54-1.003m6.694-1.293a3.748 3.748 0 01-2.068 1.72c-.467.163-.977.243-1.488.243" />
          </svg>
        }
        bgClass="bg-amber-100 dark:bg-amber-900/30"
      />
    </div>
  );
}

function EmployeeDashboard({ stats }: { stats: DashboardStats | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="My Pending Tasks"
        value={stats?.pendingTasks ?? "—"}
        icon={
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.765.66-1.516 1.47-2.179 2.323m-3.002 4.07c-.41.783-.716 1.63-.898 2.527m-1.247 5.498a48.5 48.5 0 00.158 4.07c.078.393.278.754.564 1.026.286.272.654.443 1.047.5a46.568 46.568 0 014.152.414c.468.052.938.078 1.408.078 2.147 0 4.24-.326 6.22-.93.475-.146.904-.384 1.27-.696.366-.313.613-.708.716-1.147.218-.918.306-1.87.274-2.82m-7.61-2.62l.54-1.003m6.694-1.293a3.748 3.748 0 01-2.068 1.72c-.467.163-.977.243-1.488.243" />
          </svg>
        }
        bgClass="bg-amber-100 dark:bg-amber-900/30"
      />
      <StatCard
        label="Present Today"
        value={stats?.presentToday ? "Yes" : "—"}
        icon={
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        bgClass="bg-emerald-100 dark:bg-emerald-900/30"
      />
      <StatCard
        label="Active Projects"
        value={stats?.activeProjects ?? "—"}
        icon={
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
        }
        bgClass="bg-blue-100 dark:bg-blue-900/30"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  bgClass,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  bgClass: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${bgClass}`}
        >
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

function QuickActionButton({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition"
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}