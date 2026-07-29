"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";

interface Task {
  _id: string;
  title: string;
  description?: string;
  assignedTo: { _id: string; name: string; email: string };
  assignedBy: { _id: string; name: string; email: string };
  projectId: { _id: string; title: string; status: string };
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  comments: any[];
  createdAt: string;
}

const priorityColors: Record<string, string> = {
  urgent: "text-red-600 dark:text-red-400",
  high: "text-amber-600 dark:text-amber-400",
  medium: "text-blue-600 dark:text-blue-400",
  low: "text-zinc-500 dark:text-zinc-400",
};

const statusConfig: Record<string, { label: string; color: string }> = {
  todo: { label: "To Do", color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700" },
  "in-progress": { label: "In Progress", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  done: { label: "Done", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
};

export default function MyTasksPage() {
  const { data: session, status: authStatus } = useSession();
  const userId = (session?.user as any)?.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
  }, [authStatus]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/tasks?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTasks(data.tasks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) fetchTasks();
  }, [userId, statusFilter]);

  const handleStatusUpdate = async (taskId: string, status: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchTasks();
    } catch {}
  };

  if (authStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">My Tasks</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            View and update your assigned tasks
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Status</option>
          <option value="todo">To Do</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>

      {/* Task Cards */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 animate-pulse">
              <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
              <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No tasks assigned to you</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task._id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{task.title}</h3>
                      <span className={`text-xs font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
                    </div>
                    {task.description && (
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{task.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                      <span>Project: <Link href={`/projects/${task.projectId?._id}`} className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{task.projectId?.title || "—"}</Link></span>
                      <span>Assigned by: <span className="font-medium text-zinc-600 dark:text-zinc-300">{task.assignedBy?.name || "—"}</span></span>
                      {task.dueDate && <span>Due: <span className={new Date(task.dueDate) < new Date() && task.status !== "done" ? "text-red-500 font-medium" : ""}>{new Date(task.dueDate).toLocaleDateString()}</span></span>}
                      <span>Comments: {task.comments?.length || 0}</span>
                    </div>
                  </div>

                  {/* Status selector */}
                  <div className="flex items-center gap-2">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusUpdate(task._id, e.target.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 ${statusConfig[task.status]?.color || ""} bg-white dark:bg-zinc-800`}
                    >
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>
              </div>
              {/* Quick comment via link to project */}
              <div className="px-5 pb-3">
                <Link href={`/projects/${task.projectId?._id}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  View in project &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}