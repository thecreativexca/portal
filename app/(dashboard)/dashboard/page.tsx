"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ExecutiveDashboard from "@/components/ExecutiveDashboard";

interface DashboardStats {
  totalEmployees?: number;
  activeProjects?: number;
  pendingLeaves?: number;
  pendingTasks?: number;
  presentToday?: number | boolean;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  const d = new Date();
  const weeks = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${weeks[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function dashboardTitle(role?: string, isExecutive?: boolean) {
  if (isExecutive) return "Executive Dashboard";
  if (role === "project_manager" || role === "team_lead") return "Manager Dashboard";
  return "Your Dashboard";
}

function dashboardSubtitle(role?: string, isExecutive?: boolean) {
  if (isExecutive)
    return "Company-wide performance, finances, and alerts — live from your data";
  if (role === "project_manager" || role === "team_lead")
    return "Team performance and activity at a glance";
  return "Your tasks, attendance, and projects in one place";
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const name = (session?.user as { name?: string })?.name;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const isExecutive = role === "ceo" || role === "hr";

  useEffect(() => {
    if (!role || isExecutive) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchStats() {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [role, isExecutive]);

  return (
    <div className="animate-fade-in">
      {/* Hero banner */}
      <section className="dashboard-hero animate-fade-in-up">
        <div className="dashboard-hero-inner">
          <div className="flex items-start gap-4">
            <div className="dashboard-avatar">{initials(name)}</div>
            <div>
              <p className="dashboard-greeting">
                {greeting()}{name ? `, ${name.split(" ")[0]}` : ""}
              </p>
              <h1 className="dashboard-title">
                {dashboardTitle(role, isExecutive)}
              </h1>
              <p className="dashboard-subtitle">
                {dashboardSubtitle(role, isExecutive)}
              </p>
            </div>
          </div>
          <div className="dashboard-hero-meta">
            <div className="date-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{todayLabel()}</span>
            </div>
            {!isExecutive && stats?.presentToday !== undefined && (
              <span className={`badge ${stats.presentToday ? "badge-green" : "badge-amber"}`}>
                {stats.presentToday ? "Checked in today" : "Not checked in"}
              </span>
            )}
          </div>
        </div>
      </section>

      <main>
        {isExecutive ? (
          <ExecutiveDashboard />
        ) : loading ? (
          <StatsSkeleton />
        ) : role === "project_manager" || role === "team_lead" ? (
          <ManagerDashboard stats={stats} />
        ) : (
          <EmployeeDashboard stats={stats} />
        )}

        {!isExecutive && <QuickActions role={role} />}
      </main>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="stat-grid">
      {[0, 1, 2].map((i) => (
        <div key={i} className="stat-card">
          <div className="skeleton" style={{ height: 44, width: 44, marginBottom: 14, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 12, width: 90, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 30, width: 56 }} />
        </div>
      ))}
    </div>
  );
}

function ManagerDashboard({ stats }: { stats: DashboardStats | null }) {
  return (
    <div className="stat-grid">
      <StatCard
        label="Pending Tasks"
        value={stats?.pendingTasks ?? "—"}
        sub="Across all projects"
        tile="tile-amber"
        href="/tasks"
        delay={0}
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        }
      />
      <StatCard
        label="Active Projects"
        value={stats?.activeProjects ?? "—"}
        sub="Currently in progress"
        tile="tile-blue"
        href="/projects"
        delay={1}
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
        }
      />
      <StatCard
        label="Your Attendance"
        value={stats?.presentToday ? "Present" : "—"}
        sub={stats?.presentToday ? "Marked today" : "Mark attendance now"}
        tile="tile-green"
        href="/attendance"
        delay={2}
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  );
}

function EmployeeDashboard({ stats }: { stats: DashboardStats | null }) {
  return (
    <div className="stat-grid">
      <StatCard
        label="Pending Tasks"
        value={stats?.pendingTasks ?? "—"}
        sub="Assigned to you"
        tile="tile-amber"
        href="/tasks"
        delay={0}
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.765.66-1.516 1.47-2.179 2.323m-3.002 4.07c-.41.783-.716 1.63-.898 2.527m-1.247 5.498a48.5 48.5 0 00.158 4.07c.078.393.278.754.564 1.026.286.272.654.443 1.047.5a46.568 46.568 0 014.152.414c.468.052.938.078 1.408.078 2.147 0 4.24-.326 6.22-.93.475-.146.904-.384 1.27-.696.366-.313.613-.708.716-1.147.218-.918.306-1.87.274-2.82m-7.61-2.62l.54-1.003m6.694-1.293a3.748 3.748 0 01-2.068 1.72c-.467.163-.977.243-1.488.243" />
          </svg>
        }
      />
      <StatCard
        label="Attendance"
        value={stats?.presentToday ? "Present" : "—"}
        sub={stats?.presentToday ? "You're checked in" : "Not marked yet"}
        tile="tile-green"
        href="/attendance"
        delay={1}
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
      <StatCard
        label="My Projects"
        value={stats?.activeProjects ?? "—"}
        sub="Active team projects"
        tile="tile-blue"
        href="/projects"
        delay={2}
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
        }
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tile,
  href,
  delay = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  tile: string;
  href?: string;
  delay?: number;
}) {
  const inner = (
    <div
      className="stat-card stat-card-enter card-hover"
      style={{ animationDelay: `${delay * 0.05 + 0.04}s` }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p className="stat-label">{label}</p>
          <p className="stat-value" style={{ color: "var(--fg)" }}>{value}</p>
          {sub && <p className="stat-sub">{sub}</p>}
        </div>
        <div className={`tile ${tile}`} style={{ width: 52, height: 52, borderRadius: 14 }}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="stat-card-link">
        {inner}
      </Link>
    );
  }
  return inner;
}

const QUICK_ACTIONS = [
  {
    label: "Mark Attendance",
    desc: "Check in or out",
    href: "/attendance",
    tile: "tile-green",
    roles: ["employee", "team_lead", "project_manager"],
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: "View Tasks",
    desc: "Your task board",
    href: "/tasks",
    tile: "tile-amber",
    roles: ["employee", "team_lead", "project_manager"],
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    label: "Team Chat",
    desc: "Messages & updates",
    href: "/chat",
    tile: "tile-blue",
    roles: ["employee", "team_lead", "project_manager"],
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
  {
    label: "Projects",
    desc: "Portfolio overview",
    href: "/projects",
    tile: "tile-purple",
    roles: ["team_lead", "project_manager"],
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
      </svg>
    ),
  },
  {
    label: "Reports",
    desc: "Analytics & exports",
    href: "/reports",
    tile: "tile-cyan",
    roles: ["team_lead", "project_manager"],
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    label: "Settings",
    desc: "Profile & preferences",
    href: "/settings",
    tile: "tile-rose",
    roles: ["employee"],
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.993c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.994c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function QuickActions({ role }: { role?: string }) {
  const actions = QUICK_ACTIONS.filter((a) => !role || a.roles.includes(role));

  return (
    <div className="card mt-8 animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
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
        <div className="quick-actions-grid">
          {actions.map((a) => (
            <Link key={a.href} href={a.href} className="quick-action">
              <span className={`tile tile-sm ${a.tile}`}>{a.icon}</span>
              <span>
                <span style={{ display: "block" }}>{a.label}</span>
                <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--fg-muted)", marginTop: 2 }}>
                  {a.desc}
                </span>
              </span>
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
