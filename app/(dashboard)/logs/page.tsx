"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

interface LogEntry {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string } | null;
  action: string;
  details: string;
  timestamp: string;
}

export default function LogsPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role !== "ceo") redirect("/");
  }, [authStatus, role]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      params.set("page", String(page));
      params.set("limit", "30");

      const res = await fetch(`/api/logs?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages);
    } catch {} finally {
      setLoading(false);
    }
  }, [actionFilter, page]);

  useEffect(() => {
    if (role === "ceo") fetchLogs();
  }, [fetchLogs, role]);

  if (authStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Activity Logs</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Track all actions performed in the system
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Actions</option>
          <option value="CREATE_USER">Create User</option>
          <option value="UPDATE_USER">Update User</option>
          <option value="DELETE_USER">Delete User</option>
          <option value="CHECK_IN">Check In</option>
          <option value="CHECK_OUT">Check Out</option>
          <option value="APPLY_LEAVE">Apply Leave</option>
          <option value="APPROVE_LEAVE">Approve Leave</option>
          <option value="REJECT_LEAVE">Reject Leave</option>
          <option value="CREATE_PROJECT">Create Project</option>
          <option value="UPDATE_PROJECT">Update Project</option>
          <option value="DELETE_PROJECT">Delete Project</option>
          <option value="CREATE_TASK">Create Task</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">User</th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">Action</th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">Details</th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-zinc-400">Loading...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-zinc-400">No activity logs found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                          {log.userId?.name?.charAt(0) || "?"}
                        </div>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {log.userId?.name || "Deleted User"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 max-w-xs truncate">
                      {log.details}
                    </td>
                    <td className="px-5 py-4 text-zinc-400 text-xs whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
            Previous
          </button>
          <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    CREATE_USER: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    UPDATE_USER: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    DELETE_USER: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    CHECK_IN: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    CHECK_OUT: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
    APPLY_LEAVE: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    APPROVE_LEAVE: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    REJECT_LEAVE: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    CREATE_PROJECT: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
    UPDATE_PROJECT: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    DELETE_PROJECT: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    CREATE_TASK: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  };

  const label = action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[action] || "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}>
      {label}
    </span>
  );
}