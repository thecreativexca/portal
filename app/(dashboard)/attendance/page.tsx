"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

interface AttendanceRecord {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string } | string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: "present" | "half-day" | "absent";
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
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
      fetch("/api/users")
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

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {role === "ceo"
            ? "View all employees' attendance records"
            : "Mark your daily attendance"}
        </p>
      </div>

      {/* Check In / Check Out Card */}
      {(!selectedUserId || selectedUserId === (session?.user as any)?.id) && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Today&apos;s Attendance
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              {todayRecord?.checkInTime && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Checked in at{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(todayRecord.checkInTime).toLocaleTimeString()}
                  </span>
                </p>
              )}
              {todayRecord?.checkOutTime && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Checked out at{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(todayRecord.checkOutTime).toLocaleTimeString()}
                  </span>
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCheckIn}
                disabled={!!todayRecord?.checkInTime || checking}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition"
              >
                {checking ? "..." : todayRecord?.checkInTime ? "Checked In ✓" : "Check In"}
              </button>
              <button
                onClick={handleCheckOut}
                disabled={!todayRecord?.checkInTime || !!todayRecord?.checkOutTime || checking}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition"
              >
                {checking
                  ? "..."
                  : todayRecord?.checkOutTime
                  ? "Checked Out ✓"
                  : "Check Out"}
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {todayRecord?.status && todayRecord.checkOutTime && (
            <div className="mt-3">
              <StatusBadge status={todayRecord.status} />
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {role === "ceo" && (
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Employees</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Attendance Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                {role === "ceo" && (
                  <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                    Employee
                  </th>
                )}
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  Date
                </th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  Check In
                </th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  Check Out
                </th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={role === "ceo" ? 5 : 4} className="px-5 py-12 text-center text-zinc-400">
                    Loading...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={role === "ceo" ? 5 : 4} className="px-5 py-12 text-center text-zinc-400">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition">
                    {role === "ceo" && (
                      <td className="px-5 py-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {typeof rec.userId === "object" ? rec.userId.name : "—"}
                      </td>
                    )}
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400">
                      {new Date(rec.date).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400">
                      {rec.checkInTime
                        ? new Date(rec.checkInTime).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400">
                      {rec.checkOutTime
                        ? new Date(rec.checkOutTime).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={rec.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    present: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    "half-day": "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    absent: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    pending: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    approved: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    rejected: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
        colors[status] || ""
      }`}
    >
      {status}
    </span>
  );
}