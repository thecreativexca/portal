"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

interface AttendanceRecord {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string } | string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  totalHours?: number;
  overtimeHours?: number;
  location?: string;
  status: "present" | "half-day" | "absent";
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

export default function AttendancePage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // CEO-only: employee selector
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("month", month);
      if (role === "ceo" && selectedUserId) {
        params.set("userId", selectedUserId);
      }

      const res = await fetch(`/api/attendance?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRecords(data.records);
      setTodayRecord(data.todayRecord);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  }, [month, selectedUserId, role]);

  useEffect(() => {
    if (role) fetchAttendance();
  }, [fetchAttendance, role]);

  // Fetch users for CEO dropdown
  useEffect(() => {
    if (role === "ceo") {
      fetch("/api/users?pageSize=200")
        .then((r) => r.json())
        .then((data) => setUsers(data.users || []))
        .catch(() => {});
    }
  }, [role]);

  const handleCheckIn = async () => {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/checkin", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Check-in failed");
      }
      fetchAttendance();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleCheckOut = async () => {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/checkout", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Check-out failed");
      }
      fetchAttendance();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  // Analytics derived from the already-fetched records (no extra round-trip).
  const analytics = useMemo(() => {
    const presentCount = records.filter(
      (r) => r.status === "present" || r.status === "half-day"
    ).length;
    const withHours = records.filter((r) => (r.totalHours ?? 0) > 0);
    const avgHours = withHours.length
      ? withHours.reduce((s, r) => s + (r.totalHours ?? 0), 0) / withHours.length
      : 0;
    const totalOvertime = records.reduce(
      (s, r) => s + (r.overtimeHours ?? 0),
      0
    );
    return {
      presentCount,
      attendancePct: records.length
        ? Math.round((presentCount / records.length) * 100)
        : 0,
      avgHours: Math.round(avgHours * 10) / 10,
      totalOvertime: Math.round(totalOvertime * 10) / 10,
    };
  }, [records]);

  const dailyHours = useMemo(() => {
    const byDay = new Map<string, { label: string; hours: number; ts: number }>();
    records.forEach((r) => {
      const d = new Date(r.date);
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const ts = d.getTime();
      const existing = byDay.get(label);
      if (existing) {
        existing.hours += r.totalHours ?? 0;
      } else {
        byDay.set(label, { label, hours: r.totalHours ?? 0, ts });
      }
    });
    return Array.from(byDay.values())
      .map((v) => ({ date: v.label, hours: Math.round(v.hours * 100) / 100 }))
      .sort((a, b) => byDay.get(a.date)!.ts - byDay.get(b.date)!.ts);
  }, [records]);

  if (status === "loading") {
    return <LoadingCenter />;
  }

  const showToday = !selectedUserId || selectedUserId === (session?.user as any)?.id;

  return (
    <PageShell>
      <PageHeader
        title="Attendance"
        description={
          role === "ceo"
            ? "View all employees' attendance records"
            : "Mark your daily attendance"
        }
        actions={
          <div className="date-chip">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
        }
      />

      {/* Check In / Check Out Card */}
      {showToday && (
        <div className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start", justifyContent: "space-between" }} className="sm:flex-row sm:items-center">
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <div className={`tile ${todayRecord?.checkIn ? "tile-green" : "tile-blue"}`}>
                  {todayRecord?.checkIn ? (
                    <svg width="19" height="19" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg width="19" height="19" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", margin: 0, letterSpacing: "-0.01em" }}>
                    Today&apos;s Attendance
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                    {todayRecord?.checkIn && (
                      <span className="badge badge-green" style={{ fontSize: 11.5 }}>
                        In: {new Date(todayRecord.checkIn).toLocaleTimeString()}
                      </span>
                    )}
                    {todayRecord?.checkOut && (
                      <span className="badge badge-blue" style={{ fontSize: 11.5 }}>
                        Out: {new Date(todayRecord.checkOut).toLocaleTimeString()}
                      </span>
                    )}
                    {todayRecord?.checkOut && (todayRecord.totalHours ?? 0) > 0 && (
                      <span className="badge badge-gray" style={{ fontSize: 11.5 }}>
                        {todayRecord.totalHours}h worked
                        {(todayRecord.overtimeHours ?? 0) > 0 && ` Â· ${todayRecord.overtimeHours}h overtime`}
                      </span>
                    )}
                    {todayRecord?.status && todayRecord.checkOut && <StatusBadge status={todayRecord.status} />}
                    {!todayRecord?.checkIn && (
                      <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                        You haven&apos;t checked in yet today
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, width: "100%" }} className="sm:w-auto">
                <button
                  onClick={handleCheckIn}
                  disabled={!!todayRecord?.checkIn || checking}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {checking ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      Working...
                    </>
                  ) : todayRecord?.checkIn ? (
                    <>
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Checked In
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Check In
                    </>
                  )}
                </button>
                <button
                  onClick={handleCheckOut}
                  disabled={!todayRecord?.checkIn || !!todayRecord?.checkOut || checking}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  {checking ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      Working...
                    </>
                  ) : todayRecord?.checkOut ? (
                    <>
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Checked Out
                    </>
                  ) : (
                    "Check Out"
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="alert alert-error">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <FilterBar>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 160 }}
        />
        {role === "ceo" && (
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="input"
            style={{ width: "auto", flex: "1 1 220px", minWidth: 0 }}
          >
            <option value="">All Employees</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        )}
        {selectedUserId && (
          <button onClick={() => setSelectedUserId("")} className="btn btn-ghost" style={{ padding: "8px 14px" }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            All Employees
          </button>
        )}
      </FilterBar>

      {/* Analytics summary */}
      {!loading && (
        <div className="summary-strip">
          <div className="summary-item">
            <div className="tile tile-sm tile-green">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{analytics.presentCount}</div>
              <div className="summary-label">Present Days</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-blue">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{analytics.attendancePct}%</div>
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
              <div className="summary-num">{analytics.avgHours}</div>
              <div className="summary-label">Avg Hours / Day</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-purple">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M5.25 5.25L6.375 6.375M3 12h1.5m13.5 0H19M17.625 6.375L18.75 5.25M12 19.5V21M5.25 18.75l1.125-1.125M18.75 18.75l-1.125-1.125M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{analytics.totalOvertime}</div>
              <div className="summary-label">Overtime (h)</div>
            </div>
          </div>
        </div>
      )}

      {/* Daily hours chart */}
      <div className="card">
        <div className="card-header">
          <h2>Daily Working Hours</h2>
          <span className="count-chip">{records.length} records</span>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="skeleton" style={{ height: 224, borderRadius: 12 }} />
          ) : dailyHours.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No attendance data for this month</p>
              <p>Records will appear here once check-ins are made.</p>
            </div>
          ) : (
            <div style={{ height: 224 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyHours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "10px",
                      color: "var(--fg)",
                      fontSize: "12px",
                      boxShadow: "var(--shadow-md)",
                    }}
                  />
                  <Bar dataKey="hours" name="Hours" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="card desktop-user-table">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {role === "ceo" && <th>Employee</th>}
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Hours</th>
                <th>Overtime</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={role === "ceo" ? 7 : 6} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    <div className="loading-center" style={{ padding: 0 }}>
                      <div className="spinner" />
                      <span>Loading attendance...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={role === "ceo" ? 7 : 6} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    No attendance records found
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec._id}>
                    {role === "ceo" && (
                      <td style={{ fontWeight: 600, color: "var(--fg)" }}>
                        {typeof rec.userId === "object" ? rec.userId.name : "â€”"}
                      </td>
                    )}
                    <td>{new Date(rec.date).toLocaleDateString()}</td>
                    <td>
                      {rec.checkIn ? (
                        <span className="badge badge-green" style={{ fontSize: 11.5 }}>
                          {new Date(rec.checkIn).toLocaleTimeString()}
                        </span>
                      ) : "â€”"}
                    </td>
                    <td>
                      {rec.checkOut ? (
                        <span className="badge badge-blue" style={{ fontSize: 11.5 }}>
                          {new Date(rec.checkOut).toLocaleTimeString()}
                        </span>
                      ) : "â€”"}
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--fg)" }}>
                      {rec.checkOut ? `${rec.totalHours ?? 0}h` : "â€”"}
                    </td>
                    <td>
                      {(rec.overtimeHours ?? 0) > 0 ? (
                        <span className="badge badge-amber">{rec.overtimeHours}h</span>
                      ) : "â€”"}
                    </td>
                    <td><StatusBadge status={rec.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="mobile-user-list space-y-3">
        {loading ? (
          <div className="card">
            <div className="loading-center" style={{ padding: "40px 20px" }}>
              <div className="spinner" />
              <span>Loading attendance...</span>
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No attendance records</p>
              <p>No records found for this selection.</p>
            </div>
          </div>
        ) : (
          records.map((rec) => (
            <div key={rec._id} className="user-card">
              <div className="tile tile-sm tile-blue" style={{ width: 40, height: 40 }}>
                {new Date(rec.date).getDate()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5, margin: 0 }}>
                    {new Date(rec.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                  <StatusBadge status={rec.status} />
                </div>
                {role === "ceo" && typeof rec.userId === "object" && (
                  <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "2px 0 0" }}>
                    {rec.userId.name}
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {rec.checkIn && (
                    <span className="badge badge-green" style={{ fontSize: 11 }}>
                      In: {new Date(rec.checkIn).toLocaleTimeString()}
                    </span>
                  )}
                  {rec.checkOut && (
                    <span className="badge badge-blue" style={{ fontSize: 11 }}>
                      Out: {new Date(rec.checkOut).toLocaleTimeString()}
                    </span>
                  )}
                  {rec.checkOut && (
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                      {rec.totalHours ?? 0}h
                      {(rec.overtimeHours ?? 0) > 0 && ` Â· +${rec.overtimeHours}h OT`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </PageShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: "badge badge-green",
    "half-day": "badge badge-amber",
    absent: "badge badge-rose",
    pending: "badge badge-blue",
    approved: "badge badge-green",
    rejected: "badge badge-rose",
  };
  return (
    <span className={map[status] || "badge badge-gray"} style={{ textTransform: "capitalize" }}>
      {status}
    </span>
  );
}