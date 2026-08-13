"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ProjectRecord,
  UserOption,
} from "@/components/ProjectFormModal";

interface Milestone {
  _id: string;
  title: string;
  dueDate?: string;
  status: "pending" | "in-progress" | "completed";
  completedAt?: string;
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
  comments: Array<{ userId: { _id: string; name: string; email: string }; text: string; timestamp: string }>;
}

interface ProjectDetail extends ProjectRecord {
  clientId?: { _id: string; clientName: string } | null;
  projectManagerId?: {
    _id: string;
    fullName: string;
    name: string;
    email: string;
  } | null;
  createdBy: { _id: string; fullName: string; name: string; email: string };
}

interface Summary {
  health: "on-track" | "at-risk" | "delayed" | "completed";
  daysUntilEnd: number | null;
  overdue: boolean;
  milestoneSummary: { total: number; completed: number; overdue: number };
  taskSummary: { total: number; todo: number; inProgress: number; done: number };
  budgetConsumed: number;
  budgetRemaining: number;
  hoursUtilizationPct: number | null;
}

const MANAGE_ROLES = ["ceo", "project_manager", "team_lead"];

const STATUS_BADGE: Record<string, string> = {
  active:
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  completed:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  "on-hold":
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  "on-hold": "On Hold",
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "text-red-600 dark:text-red-400",
  high: "text-amber-600 dark:text-amber-400",
  medium: "text-blue-600 dark:text-blue-400",
  low: "text-zinc-500 dark:text-zinc-400",
};

const HEALTH_BADGE: Record<string, string> = {
  "on-track":
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  "at-risk":
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  delayed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  completed:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
};

const HEALTH_LABEL: Record<string, string> = {
  "on-track": "On Track",
  "at-risk": "At Risk",
  delayed: "Delayed",
  completed: "Completed",
};

const MILESTONE_STATUS_BADGE: Record<string, string> = {
  pending: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  "in-progress": "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
};

const priorityColors: Record<string, string> = {
  urgent: "text-red-600 dark:text-red-400",
  high: "text-amber-600 dark:text-amber-400",
  medium: "text-blue-600 dark:text-blue-400",
  low: "text-zinc-500 dark:text-zinc-400",
};

const taskStatusColors: Record<string, string> = {
  todo: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  "in-progress": "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  done: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : "—");
const isOverdueDate = (d?: string) =>
  !!d && new Date(d).getTime() < Date.now();

export default function ProjectDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Progress update
  const [progressInput, setProgressInput] = useState(0);
  const [hoursInput, setHoursInput] = useState("0");
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState("");

  // Milestone form
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({ title: "", dueDate: "", status: "pending" });
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [milestoneError, setMilestoneError] = useState("");

  // Team
  const [newMemberId, setNewMemberId] = useState("");

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
      setSummary(data.summary);
      setProgressInput(data.project?.progress ?? 0);
      setHoursInput(String(data.project?.actualHours ?? 0));
    } catch {
      router.push("/projects");
    }
  }, [projectId, router]);

  const fetchMilestones = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`);
      if (res.ok) {
        const data = await res.json();
        setMilestones(data.milestones || []);
      }
    } catch {}
  }, [projectId]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {}
  }, [projectId]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?status=active&pageSize=200");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {}
  }, []);

  const canManage = !!role && MANAGE_ROLES.includes(role);

  useEffect(() => {
    if (projectId && role) {
      const fetchers = [fetchProject(), fetchMilestones(), fetchTasks()];
      if (canManage) fetchers.push(fetchUsers());
      Promise.all(fetchers).finally(() => setLoading(false));
    }
  }, [projectId, role, canManage, fetchProject, fetchMilestones, fetchTasks, fetchUsers]);

  const handleSaveProgress = async () => {
    setSavingProgress(true);
    setProgressError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progress: Number(progressInput),
          actualHours: hoursInput === "" ? undefined : Number(hoursInput),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to update progress");
      }
      await fetchProject();
    } catch (err: any) {
      setProgressError(err.message);
    } finally {
      setSavingProgress(false);
    }
  };

  const openMilestoneModal = (m: Milestone | null) => {
    setEditingMilestone(m);
    setMilestoneForm(
      m
        ? { title: m.title, dueDate: m.dueDate ? m.dueDate.slice(0, 10) : "", status: m.status }
        : { title: "", dueDate: "", status: "pending" }
    );
    setMilestoneError("");
    setMilestoneOpen(true);
  };

  const handleSaveMilestone = async () => {
    setSavingMilestone(true);
    setMilestoneError("");
    try {
      const url = editingMilestone
        ? `/api/milestones/${editingMilestone._id}`
        : `/api/projects/${projectId}/milestones`;
      const method = editingMilestone ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(milestoneForm),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save milestone");
      }
      setMilestoneOpen(false);
      Promise.all([fetchMilestones(), fetchProject()]);
    } catch (err: any) {
      setMilestoneError(err.message);
    } finally {
      setSavingMilestone(false);
    }
  };

  const handleMilestoneStatus = async (m: Milestone, status: string) => {
    try {
      const res = await fetch(`/api/milestones/${m._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) Promise.all([fetchMilestones(), fetchProject()]);
    } catch {}
  };

  const handleDeleteMilestone = async (m: Milestone) => {
    if (!window.confirm(`Delete milestone "${m.title}"?`)) return;
    try {
      const res = await fetch(`/api/milestones/${m._id}`, { method: "DELETE" });
      if (res.ok) Promise.all([fetchMilestones(), fetchProject()]);
    } catch {}
  };

  const handleAddMember = async () => {
    if (!newMemberId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: newMemberId }),
      });
      if (res.ok) {
        setNewMemberId("");
        await fetchProject();
      }
    } catch {}
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm("Remove this member from the project?")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/team?memberId=${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) await fetchProject();
    } catch {}
  };

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

  if (authStatus === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (!project) return null;

  const ms = summary?.milestoneSummary || { total: 0, completed: 0, overdue: 0 };
  const due = summary?.daysUntilEnd ?? null;
  const hoursOver =
    !!project.estimatedHours && (project.actualHours || 0) > project.estimatedHours;
  const availableMembers = users.filter(
    (u) => !project.teamMemberIds.some((m) => m._id === u._id)
  );
  const teamMembers = project.teamMemberIds || [];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link href="/projects" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-2 inline-block">
          &larr; Back to Portfolio
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {project.projectName}
              </h1>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${STATUS_BADGE[project.status] || ""}`}>
                {STATUS_LABEL[project.status] || project.status}
              </span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${HEALTH_BADGE[summary?.health || "on-track"]}`}>
                {HEALTH_LABEL[summary?.health || "on-track"]}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {[project.projectCode, project.clientId?.clientName]
                .filter(Boolean)
                .join(" · ") || "Project"}
              {project.projectManagerId
                ? ` · PM: ${project.projectManagerId.name || project.projectManagerId.fullName}`
                : ""}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl">
              {project.description}
            </p>
          </div>
          <span className={`text-sm font-medium ${PRIORITY_BADGE[project.priority]}`}>
            {project.priority} priority
          </span>
        </div>
      </div>

      {/* Deadline alerts */}
      {summary?.overdue && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>
            {ms.overdue > 0
              ? `${ms.overdue} overdue milestone${ms.overdue === 1 ? "" : "s"}`
              : "This project is past its deadline"}
            {project.status !== "completed" && due !== null && due < 0
              ? ` (${Math.abs(due)} day${Math.abs(due) === 1 ? "" : "s"} past end date)`
              : ""}
          </span>
        </div>
      )}
      {!summary?.overdue && due !== null && due >= 0 && due <= 7 && project.status !== "completed" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Due in {due} day{due === 1 ? "" : "s"} — {project.progress}% complete</span>
        </div>
      )}

      {/* Progress + Budget */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Progress */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
            Progress
          </h3>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">Overall</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">
              {project.progress}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressBarColor(project.progress)}`}
              style={{ width: `${project.progress}%` }}
            />
          </div>

          {canManage && (
            <div className="mt-4 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
              {progressError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-2.5 text-xs text-red-700 dark:text-red-400">
                  {progressError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                    Progress ({progressInput}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={progressInput}
                    onChange={(e) => setProgressInput(Number(e.target.value))}
                    className="w-full accent-indigo-600 dark:accent-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                    Actual hours logged
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={hoursInput}
                    onChange={(e) => setHoursInput(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveProgress}
                disabled={savingProgress}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {savingProgress ? "Saving..." : "Update Progress"}
              </button>
            </div>
          )}
        </div>

        {/* Budget */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
            Budget & Hours
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Budget</p>
              <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">
                {project.budget !== undefined && project.budget !== null ? fmt(project.budget) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Est. consumed</p>
              <p className="mt-1 font-medium text-zinc-700 dark:text-zinc-300">
                {project.budget ? fmt(summary?.budgetConsumed ?? 0) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Remaining</p>
              <p className="mt-1 font-medium text-zinc-700 dark:text-zinc-300">
                {project.budget ? fmt(summary?.budgetRemaining ?? 0) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Hours</p>
              <p className={`mt-1 font-semibold ${hoursOver ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-50"}`}>
                {Math.round(project.actualHours || 0)}
                <span className="text-zinc-400 font-normal"> / {project.estimatedHours ?? 0} est.</span>
              </p>
            </div>
          </div>

          {project.budget ? (
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500 dark:text-zinc-400">Budget consumed by progress</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {project.budget ? Math.round(((summary?.budgetConsumed ?? 0) / project.budget) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all"
                  style={{
                    width: `${project.budget ? Math.min(100, ((summary?.budgetConsumed ?? 0) / project.budget) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {project.estimatedHours ? (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500 dark:text-zinc-400">Estimated vs actual hours</span>
                <span className={`font-medium ${hoursOver ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"}`}>
                  {Math.round(summary?.hoursUtilizationPct ?? 0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${hoursOver ? "bg-red-500" : "bg-emerald-600 dark:bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, summary?.hoursUtilizationPct ?? 0)}%` }}
                />
              </div>
            </div>
          ) : null}

          {hoursOver && (
            <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              Actual hours have exceeded the estimate ({Math.round(project.actualHours || 0)} of {project.estimatedHours} hrs).
            </div>
          )}

          {project.startDate || project.endDate ? (
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Start: <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmtDate(project.startDate)}</span></span>
              <span>End: <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmtDate(project.endDate)}</span></span>
              {due !== null && (
                <span>
                  {due >= 0 ? "Due in" : "Overdue by"}{" "}
                  <span className={`font-medium ${due < 0 ? "text-red-500" : "text-zinc-700 dark:text-zinc-300"}`}>
                    {Math.abs(due)} day{Math.abs(due) === 1 ? "" : "s"}
                  </span>
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Milestones */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Milestones ({milestones.length})
              </h2>
              {canManage && (
                <button
                  onClick={() => openMilestoneModal(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Milestone
                </button>
              )}
            </div>
            {milestones.length === 0 ? (
              <p className="px-5 py-8 text-sm text-zinc-400 text-center">No milestones yet</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {milestones.map((m) => {
                  const overdue = m.status !== "completed" && isOverdueDate(m.dueDate);
                  return (
                    <div key={m._id} className="p-4 flex items-start gap-3">
                      <button
                        onClick={() => canManage && handleMilestoneStatus(m, m.status === "completed" ? "in-progress" : "completed")}
                        disabled={!canManage}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                          m.status === "completed"
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : overdue
                            ? "border-red-400 text-transparent"
                            : "border-zinc-300 dark:border-zinc-600 text-transparent"
                        }`}
                        title={canManage ? "Toggle complete" : m.status}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${m.status === "completed" ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-50"}`}>
                            {m.title}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${MILESTONE_STATUS_BADGE[m.status]}`}>
                            {m.status}
                          </span>
                          {overdue && (
                            <span className="text-xs text-red-600 dark:text-red-400 font-medium">Overdue</span>
                          )}
                        </div>
                        <p className={`mt-0.5 text-xs ${overdue ? "text-red-500" : "text-zinc-400"}`}>
                          Due {fmtDate(m.dueDate)}
                          {m.completedAt ? ` · completed ${fmtDate(m.completedAt)}` : ""}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={m.status}
                            onChange={(e) => handleMilestoneStatus(m, e.target.value)}
                            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="pending">Pending</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                          <button
                            onClick={() => openMilestoneModal(m)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMilestone(m)}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Tasks ({tasks.length})
              </h2>
              {canManage && (
                <button
                  onClick={() => setShowTaskForm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
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
                        {task.description && (
                          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{task.description}</p>
                        )}
                        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                          <span>Assigned to: <span className="font-medium text-zinc-600 dark:text-zinc-300">{task.assignedTo?.name || "—"}</span></span>
                          {task.dueDate && <span>Due: {fmtDate(task.dueDate)}</span>}
                        </div>
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
                        {commentTaskId === task._id ? (
                          <div className="mt-3 flex gap-2">
                            <input
                              type="text"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              placeholder="Write a comment..."
                              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button onClick={() => handleAddComment(task._id)} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white transition">Send</button>
                            <button onClick={() => { setCommentTaskId(null); setCommentText(""); }} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setCommentTaskId(task._id)} className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">+ Comment</button>
                        )}
                      </div>
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusUpdate(task._id, e.target.value)}
                        className={`rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 ${taskStatusColors[task.status]}`}
                      >
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
        </div>

        {/* Team */}
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
              Project Manager
            </h3>
            {project.projectManagerId ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                  {(project.projectManagerId.name || project.projectManagerId.fullName || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {project.projectManagerId.name || project.projectManagerId.fullName}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{project.projectManagerId.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No project manager assigned</p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Team ({teamMembers.length})
              </h3>
              {project.clientId && (
                <Link href={`/clients/${project.clientId._id}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  {project.clientId.clientName}
                </Link>
              )}
            </div>
            <div className="space-y-2">
              {teamMembers.length === 0 && (
                <p className="text-sm text-zinc-400">No team members yet</p>
              )}
              {teamMembers.map((m) => (
                <div key={m._id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
                      {(m.fullName || m.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                        {m.fullName || m.name}
                      </p>
                      <p className="text-xs text-zinc-400">{m.email}</p>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleRemoveMember(m._id)}
                      className="p-1 text-zinc-400 hover:text-red-500 transition"
                      title="Remove from project"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canManage && (
              <div className="mt-4 flex gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <select
                  value={newMemberId}
                  onChange={(e) => setNewMemberId(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Add team member...</option>
                  {availableMembers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName || u.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!newMemberId}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Milestone summary mini */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
              At a glance
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Milestones</p>
                <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">
                  {ms.completed}/{ms.total} done
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Tasks</p>
                <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">
                  {summary?.taskSummary.done ?? 0}/{summary?.taskSummary.total ?? 0} done
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Milestone modal */}
      {milestoneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              {editingMilestone ? "Edit Milestone" : "Add Milestone"}
            </h2>
            {milestoneError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {milestoneError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title</label>
                <input
                  type="text"
                  value={milestoneForm.title}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })}
                  placeholder="e.g. Design sign-off"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={milestoneForm.dueDate}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, dueDate: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Status</label>
                  <select
                    value={milestoneForm.status}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value })}
                    className={inputCls}
                  >
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setMilestoneOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMilestone}
                disabled={savingMilestone}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {savingMilestone ? "Saving..." : editingMilestone ? "Save Changes" : "Create Milestone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task modal */}
      {showTaskForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Add Task</h2>
            {taskError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">{taskError}</div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title</label>
                <input type="text" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
                <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Assign To</label>
                <select value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })} className={inputCls}>
                  <option value="">Select team member</option>
                  {teamMembers.map((m) => (
                    <option key={m._id} value={m._id}>{m.fullName || m.name} ({m.role || ""})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Priority</label>
                  <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className={inputCls}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Due Date</label>
                  <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setShowTaskForm(false)} className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 transition">Cancel</button>
              <button onClick={handleCreateTask} disabled={savingTask} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50">
                {savingTask ? "Creating..." : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function progressBarColor(progress: number): string {
  if (progress >= 100) return "bg-emerald-600 dark:bg-emerald-500";
  if (progress >= 60) return "bg-indigo-600 dark:bg-indigo-500";
  if (progress >= 30) return "bg-amber-500 dark:bg-amber-400";
  return "bg-zinc-400 dark:bg-zinc-500";
}
