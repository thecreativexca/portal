"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface Comment {
  userId: { _id: string; name: string; email: string };
  text: string;
  timestamp: string;
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  assignedTo: { _id: string; name: string; email: string };
  assignedBy: { _id: string; name: string; email: string };
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  comments: Comment[];
}

interface Project {
  _id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "on-hold";
  createdBy: { _id: string; name: string; email: string };
  teamMembers: User[];
  startDate?: string;
  endDate?: string;
}

const priorityColors: Record<string, string> = {
  urgent: "text-red-600 dark:text-red-400",
  high: "text-amber-600 dark:text-amber-400",
  medium: "text-blue-600 dark:text-blue-400",
  low: "text-zinc-500 dark:text-zinc-400",
};

const statusColors: Record<string, string> = {
  todo: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  "in-progress": "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  done: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
};

export default function ProjectDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assignedTo: "", priority: "medium", dueDate: "" });
  const [savingTask, setSavingTask] = useState(false);
  const [taskError, setTaskError] = useState("");

  // Comment form
  const [commentText, setCommentText] = useState("");
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setProject(data.project);
    } catch {
      router.push("/projects");
    }
  }, [projectId, router]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch {}
  }, [projectId]);

  useEffect(() => {
    if (projectId && role) {
      Promise.all([fetchProject(), fetchTasks()]).finally(() => setLoading(false));
    }
  }, [projectId, role, fetchProject, fetchTasks]);

  useEffect(() => {
    if (role === "ceo" || role === "manager") {
      fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => {});
    }
  }, [role]);

  const handleCreateTask = async () => {
    setSavingTask(true);
    setTaskError("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...taskForm, projectId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create task");
      }
      setShowTaskForm(false);
      setTaskForm({ title: "", description: "", assignedTo: "", priority: "medium", dueDate: "" });
      fetchTasks();
    } catch (err: any) {
      setTaskError(err.message);
    } finally {
      setSavingTask(false);
    }
  };

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

  const handleAddComment = async (taskId: string) => {
    if (!commentText.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText }),
      });
      if (res.ok) {
        setCommentText("");
        setCommentTaskId(null);
        fetchTasks();
      }
    } catch {}
  };

  const canManage = role === "ceo" || role === "manager";

  if (authStatus === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link href="/projects" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-2 inline-block">&larr; Back to Projects</Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{project.title}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{project.description}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusColors[project.status] || ""}`}>
            {project.status}
          </span>
        </div>
      </div>

      {/* Team Members */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Team Members</h3>
        <div className="flex flex-wrap gap-2">
          {project.teamMembers.map((m) => (
            <span key={m._id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">{m.name.charAt(0)}</span>
              {m.name}
            </span>
          ))}
        </div>
      </div>

      {/* Tasks Section */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tasks ({tasks.length})</h2>
          {canManage && (
            <button onClick={() => setShowTaskForm(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add Task
            </button>
          )}
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {tasks.length === 0 ? (
            <p className="px-5 py-8 text-sm text-zinc-400 text-center">No tasks yet</p>
          ) : (
            tasks.map((task) => (
              <div key={task._id} className="p-5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{task.title}</h3>
                      <span className={`text-xs font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
                    </div>
                    {task.description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{task.description}</p>}
                    <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                      <span>Assigned to: <span className="font-medium text-zinc-600 dark:text-zinc-300">{task.assignedTo?.name || "—"}</span></span>
                      {task.dueDate && <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>}
                    </div>

                    {/* Comments */}
                    {task.comments.length > 0 && (
                      <div className="mt-3 space-y-2 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700">
                        {task.comments.map((c, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">{c.userId?.name || "—"}</span>
                            <span className="text-zinc-400 ml-1">{c.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add comment */}
                    {commentTaskId === task._id ? (
                      <div className="mt-3 flex gap-2">
                        <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment..." className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <button onClick={() => handleAddComment(task._id)} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white transition">Send</button>
                        <button onClick={() => { setCommentTaskId(null); setCommentText(""); }} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setCommentTaskId(task._id)} className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">+ Comment</button>
                    )}
                  </div>

                  {/* Status dropdown */}
                  <select value={task.status} onChange={(e) => handleStatusUpdate(task._id, e.target.value)}
                    className={`rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 ${(() => {
                      const c = statusColors[task.status];
                      return c ? c.split(" ").slice(1).join(" ") + " bg-white dark:bg-zinc-800" : "";
                    })()}`}>
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Add Task</h2>
            {taskError && <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">{taskError}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title</label>
                <input type="text" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
                <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={2} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Assign To</label>
                <select value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select team member</option>
                  {users.filter((u) => project?.teamMembers.some((m) => m._id === u._id)).map((u) => (
                    <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Priority</label>
                  <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Due Date</label>
                  <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setShowTaskForm(false)} className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 transition">Cancel</button>
              <button onClick={handleCreateTask} disabled={savingTask} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50">{savingTask ? "Creating..." : "Create Task"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}