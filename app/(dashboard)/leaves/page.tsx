"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

interface LeaveRecord {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string };
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: { _id: string; name: string; email: string };
  createdAt: string;
}

export default function LeavesPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;

  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "pending">("all");

  // Apply form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (tab === "pending") params.set("status", "pending");
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/leaves?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLeaves(data.leaves);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error("Error fetching leaves:", err);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    if (role) fetchLeaves();
  }, [fetchLeaves, role]);

  const handleApply = async () => {
    setSaving(true);
    setFormError("");

    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply leave");
      }

      setShowForm(false);
      setForm({ startDate: "", endDate: "", reason: "" });
      fetchLeaves();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveReject = async (id: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/leaves/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update leave");
        return;
      }

      fetchLeaves();
    } catch (err) {
      console.error("Error updating leave:", err);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  const pendingCount = leaves.filter((l) => l.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Leave Management
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {role === "ceo"
              ? "Review and manage employee leave requests"
              : "Apply for leave and view your history"}
          </p>
        </div>
        {role !== "ceo" && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Apply Leave
          </button>
        )}
      </div>

      {/* CEO Tabs */}
      {role === "ceo" && (
        <div className="flex gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 w-fit">
          <button
            onClick={() => { setTab("all"); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              tab === "all"
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            All Leaves
          </button>
          <button
            onClick={() => { setTab("pending"); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              tab === "pending"
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            Pending
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Leaves Table */}
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
                  From
                </th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  To
                </th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  Reason
                </th>
                <th className="text-left px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  Status
                </th>
                {role === "ceo" && (
                  <th className="text-right px-5 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={role === "ceo" ? 6 : 5}
                    className="px-5 py-12 text-center text-zinc-400"
                  >
                    Loading...
                  </td>
                </tr>
              ) : leaves.length === 0 ? (
                <tr>
                  <td
                    colSpan={role === "ceo" ? 6 : 5}
                    className="px-5 py-12 text-center text-zinc-400"
                  >
                    No leave records found
                  </td>
                </tr>
              ) : (
                leaves.map((leave) => (
                  <tr
                    key={leave._id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition"
                  >
                    {role === "ceo" && (
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                            {leave.userId?.name?.charAt(0) || "?"}
                          </div>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {leave.userId?.name || "—"}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400">
                      {new Date(leave.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400">
                      {new Date(leave.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate">
                      {leave.reason}
                    </td>
                    <td className="px-5 py-4">
                      <LeaveStatusBadge status={leave.status} />
                    </td>
                    {role === "ceo" && leave.status === "pending" && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApproveReject(leave._id, "approved")}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApproveReject(leave._id, "rejected")}
                            className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                    {role === "ceo" && leave.status !== "pending" && (
                      <td className="px-5 py-4 text-right text-xs text-zinc-400">
                        {leave.approvedBy ? `by ${leave.approvedBy.name}` : "—"}
                      </td>
                    )}
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
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Next
          </button>
        </div>
      )}

      {/* Apply Leave Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Apply for Leave
            </h2>

            {formError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason
                </label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Explain why you need leave (min 10 characters)..."
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={saving}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {saving ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    approved:
      "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    rejected:
      "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
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