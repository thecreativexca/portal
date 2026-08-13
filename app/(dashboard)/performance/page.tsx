"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

interface ScoreBreakdown {
  attendance: number;
  completion: number;
  onTime: number;
  utilization: number;
}

interface PerformanceSummary {
  expectedWorkingDays: number;
  presentDays: number;
  halfDays: number;
  attendancePercentage: number;
  averageWorkingHours: number;
  totalLoggedHours: number;
  overtimeHours: number;
  tasksCompleted: number;
  tasksOverdue: number;
  projectUtilization: number;
  leaveDays: number;
  productivityScore: number;
  scores: ScoreBreakdown;
}

interface ProjectUtilization {
  projectId: string;
  projectName: string;
  loggedHours: number;
  utilization: number;
}

interface PerformanceUser {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  departmentId?: string;
  joiningDate: string | null;
  summary: PerformanceSummary;
  projectBreakdown: ProjectUtilization[];
  attendanceTrend?: { date: string; totalHours: number; status: string }[];
}

interface TeamResponse {
  members: PerformanceUser[];
  averages: {
    attendancePercentage: number;
    averageWorkingHours: number;
    totalLoggedHours: number;
    projectUtilization: number;
    productivityScore: number;
    leaveDays: number;
  };
  range: { from: string; to: string };
}

interface UserOption {
  _id: string;
  name?: string;
  fullName?: string;
  email?: string;
  role?: string;
}

function localDateString(d: Date): string {
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

const CHART_TOOLTIP = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-strong)",
  borderRadius: "10px",
  color: "var(--fg)",
  fontSize: "12px",
  boxShadow: "var(--shadow-md)",
};

export default function PerformancePage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const myId = (session?.user as any)?.id;
  const canViewTeam = ["ceo", "hr", "project_manager"].includes(role);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => localDateString(new Date()));

  const [selectedUserId, setSelectedUserId] = useState("");
  const [perf, setPerf] = useState<PerformanceUser | null>(null);
  const [team, setTeam] = useState<PerformanceUser[] | null>(null);
  const [averages, setAverages] = useState<TeamResponse["averages"] | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const showTeam = canViewTeam && !selectedUserId;

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      if (!showTeam) params.set("userId", selectedUserId || myId);

      const res = await fetch(`/api/performance?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load performance data");
      }
      const data = await res.json();
      if (showTeam) {
        const teamData = data as TeamResponse;
        setTeam(teamData.members || []);
        setAverages(teamData.averages || null);
        setPerf(null);
      } else {
        setPerf(data.performance || null);
        setTeam(null);
        setAverages(null);
      }
    } catch (err: any) {
      setError(err.message);
      setPerf(null);
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedUserId, showTeam, myId]);

  useEffect(() => {
    if (role) fetchData();
  }, [fetchData, role]);

  useEffect(() => {
    if (canViewTeam) {
      fetch("/api/users?pageSize=200")
        .then((r) => r.json())
        .then((d) => setUsers(d.users || []))
        .catch(() => {});
    }
  }, [canViewTeam]);

  if (status === "loading") {
    return <LoadingCenter />;
  }

  const scoreData = perf
    ? [
        { name: "Attendance", score: perf.summary.scores.attendance },
        { name: "Completion", score: perf.summary.scores.completion },
        { name: "On-Time", score: perf.summary.scores.onTime },
        { name: "Utilization", score: perf.summary.scores.utilization },
      ]
    : [];

  const trendData = (perf?.attendanceTrend || []).map((p) => ({
    date: p.date,
    hours: p.totalHours,
  }));

  const teamChartData = (team || []).map((m) => ({
    name: m.fullName.split(" ")[0] || m.fullName,
    score: m.summary.productivityScore,
  }));

  return (
    <PageShell>
      <PageHeader
        title="Employee Performance"
        description={
          showTeam
            ? "Team utilization and productivity overview"
            : `${perf?.fullName || "Your"} performance profile`
        }
        badge={
          showTeam && team
            ? <span className="count-chip">{team.length} members</span>
            : undefined
        }
      />

      <FilterBar>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 140 }}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 140 }}
        />
        {canViewTeam && (
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="input"
            style={{ flex: "1 1 220px", minWidth: 0 }}
          >
            <option value="">Team Overview</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.fullName || u.name} ({u.email})
              </option>
            ))}
          </select>
        )}
        {selectedUserId && (
          <button onClick={() => setSelectedUserId("")} className="btn btn-ghost" style={{ padding: "8px 14px" }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Team Overview
          </button>
        )}
      </FilterBar>

      {error && (
        <div className="alert alert-error">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="loading-center" style={{ padding: "64px 20px" }}>
            <div className="spinner" />
            <span>Loading performance data...</span>
          </div>
        </div>
      ) : showTeam ? (
        <>
          {averages && (
            <div className="summary-strip">
              <div className="summary-item">
                <div className="tile tile-sm tile-green">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{averages.attendancePercentage}%</div>
                  <div className="summary-label">Attendance</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-amber">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{averages.averageWorkingHours}</div>
                  <div className="summary-label">Avg Hours</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-blue">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{averages.totalLoggedHours}</div>
                  <div className="summary-label">Logged Hours</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-purple">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m0-13.5h2.25m0 0V3m0 0h-2.25" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{averages.projectUtilization}%</div>
                  <div className="summary-label">Utilization</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-cyan">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{averages.leaveDays}</div>
                  <div className="summary-label">Leave Days</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-purple">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{averages.productivityScore}</div>
                  <div className="summary-label">Productivity</div>
                </div>
              </div>
            </div>
          )}

          {/* Team table â€” desktop */}
          <div className="card desktop-user-table">
            <div className="card-header">
              <h2>Team Utilization</h2>
              <span className="count-chip">{team?.length ?? 0} employees</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Attendance</th>
                    <th>Avg Hours</th>
                    <th>Tasks Done</th>
                    <th>Overdue</th>
                    <th>Utilization</th>
                    <th>Leave Days</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {!team || team.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                        No employees found
                      </td>
                    </tr>
                  ) : (
                    team.map((m) => (
                      <tr key={m.userId}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="avatar avatar-sm">{initials(m.fullName)}</div>
                            <div>
                              <p style={{ fontWeight: 600, color: "var(--fg)", margin: 0, fontSize: 13.5 }}>{m.fullName}</p>
                              <p style={{ fontSize: 11, color: "var(--fg-subtle)", margin: 0, textTransform: "capitalize" }}>
                                {m.role.replace("_", " ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>{m.summary.attendancePercentage}%</td>
                        <td>{m.summary.averageWorkingHours}</td>
                        <td>{m.summary.tasksCompleted}</td>
                        <td>
                          {m.summary.tasksOverdue > 0 ? (
                            <span className="badge badge-rose">{m.summary.tasksOverdue}</span>
                          ) : "0"}
                        </td>
                        <td>{m.summary.projectUtilization}%</td>
                        <td>{m.summary.leaveDays}</td>
                        <td>
                          <ScoreBar score={m.summary.productivityScore} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Team mobile cards */}
          <div className="mobile-user-list space-y-3">
            {(team || []).map((m) => (
              <div key={m.userId} className="user-card">
                <div className="avatar avatar-sm">{initials(m.fullName)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5, margin: 0 }}>{m.fullName}</p>
                    <span className="badge badge-gray" style={{ fontSize: 10, textTransform: "capitalize" }}>
                      {m.role.replace("_", " ")}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span className="badge badge-green" style={{ fontSize: 11 }}>{m.summary.attendancePercentage}% att.</span>
                    <span className="badge badge-blue" style={{ fontSize: 11 }}>{m.summary.averageWorkingHours}h avg</span>
                    <span className="badge badge-purple" style={{ fontSize: 11 }}>{m.summary.projectUtilization}% util.</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ScoreBar score={m.summary.productivityScore} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Team productivity chart */}
          {teamChartData.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2>Productivity Score by Employee</h2>
              </div>
              <div className="card-body">
                <div style={{ height: 256 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teamChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                      <Bar dataKey="score" name="Score" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </>
      ) : perf ? (
        <>
          <div className="summary-strip">
            <div className="summary-item">
              <div className="tile tile-sm tile-green">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{perf.summary.attendancePercentage}%</div>
                <div className="summary-label">Attendance</div>
              </div>
            </div>
            <div className="summary-item">
              <div className="tile tile-sm tile-amber">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{perf.summary.averageWorkingHours}</div>
                <div className="summary-label">Avg Hours / Day</div>
              </div>
            </div>
            <div className="summary-item">
              <div className="tile tile-sm tile-blue">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{perf.summary.totalLoggedHours}</div>
                <div className="summary-label">Total Logged (h)</div>
              </div>
            </div>
            <div className="summary-item">
              <div className="tile tile-sm tile-purple">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{perf.summary.tasksCompleted}</div>
                <div className="summary-label">Tasks Done</div>
              </div>
            </div>
            <div className="summary-item">
              <div className="tile tile-sm tile-rose">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{perf.summary.tasksOverdue}</div>
                <div className="summary-label">Overdue</div>
              </div>
            </div>
            <div className="summary-item">
              <div className="tile tile-sm tile-cyan">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m0-13.5h2.25m0 0V3m0 0h-2.25" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{perf.summary.projectUtilization}%</div>
                <div className="summary-label">Utilization</div>
              </div>
            </div>
            <div className="summary-item">
              <div className="tile tile-sm tile-purple">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
              </div>
              <div>
                <div className="summary-num">{perf.summary.productivityScore}</div>
                <div className="summary-label">Productivity</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {/* Score breakdown */}
            <div className="card">
              <div className="card-header">
                <h2>Score Breakdown</h2>
              </div>
              <div className="card-body">
                <div style={{ height: 224 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                      <Bar dataKey="score" name="Score" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Daily hours trend */}
            <div className="card">
              <div className="card-header">
                <h2>Daily Working Hours</h2>
              </div>
              <div className="card-body">
                {trendData.length === 0 ? (
                  <div className="empty-state" style={{ padding: "40px 20px" }}>
                    <p style={{ fontWeight: 600, color: "var(--fg)" }}>No attendance data</p>
                    <p>No data for this date range.</p>
                  </div>
                ) : (
                  <div style={{ height: 224 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP} />
                        <Bar dataKey="hours" name="Hours" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Project utilization */}
          <div className="card">
            <div className="card-header">
              <h2>Project Utilization</h2>
              <span className="count-chip">{perf.projectBreakdown.length} projects</span>
            </div>
            <div className="card-body">
              {perf.projectBreakdown.length === 0 ? (
                <div className="empty-state" style={{ padding: "32px 20px" }}>
                  <p style={{ fontWeight: 600, color: "var(--fg)" }}>No project time logged</p>
                  <p>No logged time against projects in this range.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {perf.projectBreakdown.map((p) => (
                    <div key={p.projectId}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: "var(--fg)" }}>{p.projectName}</span>
                        <span style={{ color: "var(--fg-muted)" }}>
                          {p.loggedHours}h Â· {p.utilization}%
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: "var(--bg-card2)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 999,
                            background: "var(--primary)",
                            width: `${Math.min(100, p.utilization)}%`,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="empty-state" style={{ padding: "64px 20px" }}>
            <div className="icon">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: "var(--fg)" }}>No performance data</p>
            <p>No data available for this date range.</p>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
      <div style={{ height: 8, flex: 1, borderRadius: 999, background: "var(--bg-card2)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            borderRadius: 999,
            background: "var(--primary)",
            width: `${score}%`,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)", minWidth: 28 }}>{score}</span>
    </div>
  );
}
