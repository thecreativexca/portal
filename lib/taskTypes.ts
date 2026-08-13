/** Frontend types + display helpers shared by the tasks page, board, drawer,
 * and modals. Mirrors models/Task.ts, models/TimeLog.ts and ActivityLog. */

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in-progress",
  "review",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_META: Record<
  TaskStatus,
  { label: string; badge: string; column: string; dot: string }
> = {
  backlog: {
    label: "Backlog",
    column: "border-zinc-300 dark:border-zinc-700",
    badge:
      "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
    dot: "bg-zinc-400 dark:bg-zinc-500",
  },
  todo: {
    label: "To Do",
    column: "border-zinc-300 dark:border-zinc-700",
    badge: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
    dot: "bg-zinc-400 dark:bg-zinc-500",
  },
  "in-progress": {
    label: "In Progress",
    column: "border-blue-300 dark:border-blue-800",
    badge:
      "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  review: {
    label: "In Review",
    column: "border-amber-300 dark:border-amber-800",
    badge:
      "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  done: {
    label: "Done",
    column: "border-emerald-300 dark:border-emerald-800",
    badge:
      "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
};

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; text: string; rank: number }
> = {
  urgent: { label: "Urgent", text: "text-red-600 dark:text-red-400", rank: 4 },
  high: { label: "High", text: "text-amber-600 dark:text-amber-400", rank: 3 },
  medium: { label: "Medium", text: "text-blue-600 dark:text-blue-400", rank: 2 },
  low: { label: "Low", text: "text-zinc-500 dark:text-zinc-400", rank: 1 },
};

export interface TaskAssignee {
  _id: string;
  fullName?: string;
  name?: string;
  email: string;
  role?: string;
}

export interface TaskComment {
  _id?: string;
  userId: TaskAssignee;
  text: string;
  timestamp: string;
}

export interface TaskAttachment {
  _id: string;
  name: string;
  mimeType?: string;
  size: number;
  data?: string;
  uploadedBy: TaskAssignee;
  uploadedAt: string;
}

export interface TaskProject {
  _id: string;
  projectName: string;
  status?: string;
}

export interface TaskDep {
  _id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
}

export interface TaskRecord {
  _id: string;
  projectId: TaskProject;
  title: string;
  description?: string;
  assignedTo: TaskAssignee;
  assignedBy: TaskAssignee;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  dependencyTaskIds: TaskDep[];
  labels: string[];
  attachments: TaskAttachment[];
  billable: boolean;
  comments: TaskComment[];
  loggedMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimeLogRecord {
  _id: string;
  taskId: { _id: string; title: string } | string;
  userId: TaskAssignee;
  startTime: string;
  endTime?: string | null;
  durationMinutes?: number | null;
  notes?: string;
  billable: boolean;
}

export interface ActivityRecord {
  _id: string;
  userId: TaskAssignee;
  action: string;
  details: string;
  timestamp: string;
}

export interface WorkloadRow {
  _id: string;
  fullName: string;
  name?: string;
  email: string;
  role: string;
  designation?: string;
  tasksAssigned: number;
  tasksInProgress: number;
  tasksDone: number;
  overdue: number;
  estimatedHours: number;
  loggedMinutes: number;
  loggedHours: number;
  utilization: number | null;
}

export const inputCls =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function displayName(u?: TaskAssignee | null): string {
  return u?.fullName || u?.name || "—";
}

export function initials(u?: TaskAssignee | null): string {
  return (u?.fullName || u?.name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isOverdue(t: TaskRecord): boolean {
  return (
    !!t.dueDate &&
    t.status !== "done" &&
    new Date(t.dueDate).getTime() < Date.now()
  );
}

/** "2h 15m" from minutes; "" for zero. */
export function fmtMinutes(min?: number | null): string {
  const m = Math.max(0, Math.round(min || 0));
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h ? `${h}h ${rest}m`.trim() : `${rest}m`;
}

export function fmtDateTime(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Humanize a snake-case action string for the activity feed. */
export function fmtAction(action: string): string {
  return action.toLowerCase().replace(/_/g, " ");
}

/** Clock value "HH:MM:SS" for the running timer. */
export function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
