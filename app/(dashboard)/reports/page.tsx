"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#4f46e5", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

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

  if (authStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  const taskDist = projectData?.taskDistribution;
  const pieData = taskDist
    ? [
        { name: "To Do", value: taskDist.todo },
        { name: "In Progress", value: taskDist["in-progress"] },
        { name: "Done", value: taskDist.done },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Reports</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Attendance and project analytics
        </p>
      </div>

      {/* Attendance Report */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Attendance Report</h2>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-zinc-400 mr-1">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mr-1">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        <div className="p-5">
          {attendanceLoading ? (
            <div className="animate-pulse h-64 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
          ) : attendanceData?.summary ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <MetricBox label="Days" value={attendanceData.summary.totalDays} />
                <MetricBox label="Avg Present/Day" value={attendanceData.summary.averagePresent} />
                <MetricBox label="Total Present" value={attendanceData.summary.totalPresent} />
                <MetricBox label="Employees" value={attendanceData.summary.totalEmployees} />
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceData.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#a1a1aa" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} />
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: "8px",
                        color: "#f4f4f5",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="present" name="Present" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="halfDay" name="Half Day" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-400 text-center py-12">No attendance data for this range</p>
          )}
        </div>
      </div>

      {/* Project Progress */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Project Progress</h2>
        </div>
        <div className="p-5">
          {projectLoading ? (
            <div className="animate-pulse h-64 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Project completion bars */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Completion by Project</h3>
                <div className="space-y-3">
                  {projectData?.projectStats?.map((p: any) => (
                    <div key={p._id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-zinc-700 dark:text-zinc-300">{p.title}</span>
                        <span className="text-zinc-500">{p.completionPercent}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all"
                          style={{ width: `${p.completionPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {(!projectData?.projectStats || projectData.projectStats.length === 0) && (
                    <p className="text-sm text-zinc-400">No projects data</p>
                  )}
                </div>
              </div>

              {/* Task distribution pie */}
              <div className="flex flex-col items-center">
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3 self-start">
                  Tasks by Status
                </h3>
                {pieData.some((d) => d.value > 0) ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#18181b",
                            border: "1px solid #27272a",
                            borderRadius: "8px",
                            color: "#f4f4f5",
                            fontSize: "12px",
                          }}
                        />
                        <Legend
                          formatter={(value) => (
                            <span className="text-xs text-zinc-400">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 py-12">No tasks data</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">{value}</p>
    </div>
  );
}