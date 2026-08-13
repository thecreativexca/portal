"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

const COLORS = ["#2878f0", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6"];

const chartTooltipStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-strong)",
  borderRadius: "10px",
  color: "var(--fg)",
  fontSize: "12px",
  boxShadow: "var(--shadow-md)",
};

export default function ReportsPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);

  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role !== "ceo") redirect("/");
  }, [authStatus, role]);

  useEffect(() => {
    if (role !== "ceo") return;
    setAttendanceLoading(true);
    fetch(`/api/reports/attendance?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setAttendanceData(d))
      .catch(() => {})
      .finally(() => setAttendanceLoading(false));
  }, [from, to, role]);

  useEffect(() => {
    if (role !== "ceo") return;
    setProjectLoading(true);
    fetch("/api/reports/projects")
      .then((r) => r.json())
      .then((d) => setProjectData(d))
      .catch(() => {})
      .finally(() => setProjectLoading(false));
  }, [role]);

  if (authStatus === "loading") return <LoadingCenter />;

  const taskDist = projectData?.taskDistribution;
  const pieData = taskDist
    ? [
        { name: "To Do", value: taskDist.todo },
        { name: "In Progress", value: taskDist["in-progress"] },
        { name: "Done", value: taskDist.done },
      ]
    : [];

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        description="Attendance and project analytics for executive overview"
        badge={
          <span className="date-chip">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            Analytics
          </span>
        }
      />

      {/* Attendance Report */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap" }}>
          <h2>Attendance Report</h2>
          <div className="report-date-filters">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </label>
          </div>
        </div>

        <div className="card-body">
          {attendanceLoading ? (
            <div className="skeleton" style={{ height: 280, borderRadius: 12 }} />
          ) : attendanceData?.summary ? (
            <>
              <div className="report-metric-grid">
                <MetricBox label="Days" value={attendanceData.summary.totalDays} />
                <MetricBox label="Avg Present/Day" value={attendanceData.summary.averagePresent} />
                <MetricBox label="Total Present" value={attendanceData.summary.totalPresent} />
                <MetricBox label="Employees" value={attendanceData.summary.totalEmployees} />
              </div>
              <div style={{ height: 288 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceData.daily}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "var(--bg-card2)" }} />
                    <Legend formatter={(value) => <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{value}</span>} />
                    <Bar dataKey="present" name="Present" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="halfDay" name="Half Day" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="icon">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                </svg>
              </div>
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No attendance data</p>
              <p>Try adjusting the date range above.</p>
            </div>
          )}
        </div>
      </div>

      {/* Project Progress */}
      <div className="card">
        <div className="card-header">
          <h2>Project Progress</h2>
          <span className="count-chip">{projectData?.projectStats?.length ?? 0} projects</span>
        </div>
        <div className="card-body">
          {projectLoading ? (
            <div className="skeleton" style={{ height: 280, borderRadius: 12 }} />
          ) : (
            <div style={{ display: "grid", gap: 24 }}>
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Completion bars */}
                <div>
                  <p className="modal-section-title" style={{ marginTop: 0 }}>Completion by Project</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {projectData?.projectStats?.map((p: any) => (
                      <div key={p._id}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, color: "var(--fg)" }}>{p.projectName}</span>
                          <span style={{ color: "var(--fg-muted)", fontWeight: 700 }}>{p.completionPercent}%</span>
                        </div>
                        <div className="progress-bar" style={{ height: 8 }}>
                          <div className="progress-fill" style={{ width: `${p.completionPercent}%` }} />
                        </div>
                      </div>
                    ))}
                    {(!projectData?.projectStats || projectData.projectStats.length === 0) && (
                      <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>No project data available</p>
                    )}
                  </div>
                </div>

                {/* Pie chart */}
                <div>
                  <p className="modal-section-title" style={{ marginTop: 0 }}>Tasks by Status</p>
                  {pieData.some((d) => d.value > 0) ? (
                    <div style={{ height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={chartTooltipStyle} />
                          <Legend formatter={(value) => <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{value}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: "32px 16px" }}>
                      <p style={{ fontWeight: 600, color: "var(--fg)" }}>No task data</p>
                      <p>Tasks will appear once projects are active.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function MetricBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="report-metric">
      <p className="report-metric-label">{label}</p>
      <p className="report-metric-value">{value}</p>
    </div>
  );
}
