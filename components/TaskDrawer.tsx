"use client";

import { useEffect, useState } from "react";
import {
  TaskRecord,
  TimeLogRecord,
  ActivityRecord,
  TASK_STATUSES,
  STATUS_META,
  PRIORITY_META,
  displayName,
  initials,
  fmtDate,
  fmtDateTime,
  fmtMinutes,
  fmtAction,
  isOverdue,
} from "@/lib/taskTypes";

interface TaskDrawerProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  canManage: boolean;
  currentUserId: string;
  activeTimer: { _id: string; taskId: string; startTime: string } | null;
  onStartTimer: (taskId: string) => Promise<void>;
  onStopTimer: (taskId: string, notes?: string) => Promise<void>;
  onEdit?: (task: TaskRecord) => void;
}

interface TimeForm {
  start: string;
  end: string;
  notes: string;
  billable: boolean;
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

export default function TaskDrawer({
  taskId,
  open,
  onClose,
  onChanged,
  canManage,
  currentUserId,
  activeTimer,
  onStartTimer,
  onStopTimer,
  onEdit,
}: TaskDrawerProps) {
  const [detail, setDetail] = useState<TaskRecord | null>(null);
  const [logs, setLogs] = useState<TimeLogRecord[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Comment input
  const [commentText, setCommentText] = useState("");
  // Attachment upload
  const [uploading, setUploading] = useState(false);
  // Manual time form
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeForm, setTimeForm] = useState<TimeForm>(() => ({
    start: toLocalInput(new Date(Date.now() - 60 * 60 * 1000)),
    end: toLocalInput(new Date()),
    notes: "",
    billable: true,
  }));
  const [timeError, setTimeError] = useState("");
  // Error banner
  const [error, setError] = useState("");

  const task = detail;

  const refetch = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const [detailRes, logsRes, activityRes] = await Promise.all([
        fetch(`/api/tasks/${taskId}`),
        fetch(`/api/tasks/${taskId}/time`),
        fetch(`/api/tasks/${taskId}/activity`),
      ]);
      if (detailRes.ok) {
        const d = await detailRes.json();
        setDetail(d.task);
      }
      if (logsRes.ok) {
        const d = await logsRes.json();
        setLogs(d.logs || []);
      }
      if (activityRes.ok) {
        const d = await activityRes.json();
        setActivity(d.activity || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && taskId) {
      setDetail(null);
      setCommentText("");
      setTimeOpen(false);
      setError("");
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  if (!open || !task) {
    return null;
  }

  const isAssigned = task.assignedTo?._id === currentUserId;
  const canAct = canManage || isAssigned;
  const thisTimerRunning = activeTimer?.taskId === task._id;
  const overdue = isOverdue(task);

  const handleStatusChange = async (status: string) => {
    try {
      const res = await fetch(`/api/tasks/${task._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await refetch();
        onChanged();
      }
    } catch {}
  };

  const handleDeleteTask = async () => {
    if (!window.confirm(`Delete task "${task.title}"? This also removes its time logs.`))
      return;
    try {
      const res = await fetch(`/api/tasks/${task._id}`, { method: "DELETE" });
      if (res.ok) {
        onClose();
        onChanged();
      } else {
        const d = await res.json();
        setError(d.error || "Failed to delete task");
      }
    } catch {}
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${task._id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText }),
      });
      if (res.ok) {
        setCommentText("");
        await refetch();
        onChanged();
      }
    } catch {}
  };

  const handleDeleteComment = async (commentId?: string) => {
    if (!commentId) return;
    try {
      const res = await fetch(
        `/api/tasks/${task._id}/comment/${commentId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await refetch();
        onChanged();
      }
    } catch {}
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large (max 5 MB)");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/tasks/${task._id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type,
          size: file.size,
          data: dataUrl,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Upload failed");
      }
      await refetch();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(
        `/api/tasks/${task._id}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await refetch();
        onChanged();
      }
    } catch {}
  };

  const handleAddLog = async () => {
    setTimeError("");
    const startTime = new Date(timeForm.start);
    const endTime = new Date(timeForm.end);
    if (isNaN(startTime.getTime())) {
      setTimeError("Valid start time required");
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${task._id}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          notes: timeForm.notes,
          billable: timeForm.billable,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to add time");
      }
      setTimeOpen(false);
      setTimeForm((f) => ({ ...f, notes: "" }));
      await refetch();
      onChanged();
    } catch (err: any) {
      setTimeError(err.message || "Failed to add time");
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm("Delete this time log?")) return;
    try {
      const res = await fetch(`/api/tasks/${task._id}/time/${logId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await refetch();
        onChanged();
      }
    } catch {}
  };

  const blockedBy = task.dependencyTaskIds.filter((d) => d.status !== "done");
  const totalLoggedMinutes = logs.reduce(
    (s, l) => s + (l.endTime ? l.durationMinutes || 0 : 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm">
      {/* Click-outside close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 w-full max-w-xl shadow-2xl flex flex-col drawer-panel">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {task.title}
              </h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_META[task.priority]?.text}`}
              >
                {task.priority}
              </span>
              {!task.billable && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                  Non-billable
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {task.projectId?.projectName || "Project"} · Assigned to{" "}
              {displayName(task.assignedTo)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* Status + Timer */}
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={!canAct}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 ${STATUS_META[task.status].badge} bg-white dark:bg-zinc-800`}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
                {overdue && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 text-xs font-medium">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    Overdue
                  </span>
                )}
                {canAct && (
                  <button
                    onClick={() =>
                      thisTimerRunning
                        ? onStopTimer(task._id)
                        : onStartTimer(task._id)
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
                      thisTimerRunning
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {thisTimerRunning ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                        </svg>
                        Stop Timer
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start Timer
                      </>
                    )}
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {canManage && (
                    <button
                      onClick={handleDeleteTask}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition"
                      title="Delete task"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => onEdit?.(task)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              {task.description ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                  {task.description}
                </p>
              ) : (
                <p className="text-sm text-zinc-400 italic">No description.</p>
              )}

              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Meta label="Project" value={task.projectId?.projectName || "—"} />
                <Meta
                  label="Assignee"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                        {initials(task.assignedTo)}
                      </span>
                      {displayName(task.assignedTo)}
                    </span>
                  }
                />
                <Meta label="Created by" value={displayName(task.assignedBy)} />
                <Meta label="Start" value={fmtDate(task.startDate)} />
                <Meta
                  label="Due"
                  value={
                    <span className={overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                      {fmtDate(task.dueDate)}
                    </span>
                  }
                />
                <Meta
                  label="Est. hours"
                  value={
                    task.estimatedHours != null
                      ? String(task.estimatedHours)
                      : "—"
                  }
                />
                <Meta
                  label="Logged"
                  value={
                    <span className={task.estimatedHours && totalLoggedMinutes / 60 > task.estimatedHours ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                      {fmtMinutes(totalLoggedMinutes)}
                    </span>
                  }
                />
                <Meta label="Status" value={STATUS_META[task.status].label} />
                <Meta
                  label="Labels"
                  value={
                    task.labels.length ? (
                      <span className="flex flex-wrap gap-1">
                        {task.labels.map((l) => (
                          <span
                            key={l}
                            className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-medium"
                          >
                            {l}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>

              {/* Dependencies */}
              <section>
                <SectionTitle
                  count={task.dependencyTaskIds.length}
                  title="Dependencies"
                />
                {task.dependencyTaskIds.length === 0 ? (
                  <p className="text-sm text-zinc-400">No dependencies.</p>
                ) : (
                  <div className="space-y-1.5">
                    {task.dependencyTaskIds.map((d) => (
                      <div
                        key={d._id}
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                      >
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            d.status === "done"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                        />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                          {d.title}
                        </span>
                        <span className="ml-auto text-xs text-zinc-400 shrink-0">
                          {d.status}
                        </span>
                      </div>
                    ))}
                    {blockedBy.length > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Blocked by {blockedBy.length} task
                        {blockedBy.length > 1 ? "s" : ""} that{" "}
                        {blockedBy.length > 1 ? "aren't" : "isn't"} done.
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Attachments */}
              <section>
                <SectionTitle
                  count={task.attachments.length}
                  title="Attachments"
                />
                {canAct && (
                  <div className="mb-2">
                    <input
                      id="attach-input"
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => document.getElementById("attach-input")?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                    >
                      {uploading ? (
                        "Uploading..."
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Attach file
                        </>
                      )}
                    </button>
                  </div>
                )}
                {task.attachments.length === 0 ? (
                  <p className="text-sm text-zinc-400">No attachments.</p>
                ) : (
                  <div className="space-y-1.5">
                    {task.attachments.map((a) => (
                      <div
                        key={a._id}
                        className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                            {a.name}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {(a.size / 1024).toFixed(1)} KB · {displayName(a.uploadedBy)} ·{" "}
                            {fmtDateTime(a.uploadedAt)}
                          </p>
                        </div>
                        {a.data && (
                          <a
                            href={a.data}
                            download={a.name}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                            title="Download"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </a>
                        )}
                        {(canManage || a.uploadedBy?._id === currentUserId) && (
                          <button
                            onClick={() => handleDeleteAttachment(a._id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Time */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Time ({fmtMinutes(totalLoggedMinutes)})
                  </h3>
                  {canAct && (
                    <button
                      onClick={() => setTimeOpen((v) => !v)}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {timeOpen ? "Cancel" : "+ Log time"}
                    </button>
                  )}
                </div>

                {timeOpen && (
                  <div className="mb-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
                    {timeError && (
                      <div className="rounded bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-2 text-xs text-red-700 dark:text-red-400">
                        {timeError}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Start</label>
                        <input
                          type="datetime-local"
                          value={timeForm.start}
                          onChange={(e) => setTimeForm({ ...timeForm, start: e.target.value })}
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">End</label>
                        <input
                          type="datetime-local"
                          value={timeForm.end}
                          onChange={(e) => setTimeForm({ ...timeForm, end: e.target.value })}
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={timeForm.notes}
                      onChange={(e) => setTimeForm({ ...timeForm, notes: e.target.value })}
                      placeholder="What did you work on?"
                      className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
                    />
                    <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={timeForm.billable}
                        onChange={(e) => setTimeForm({ ...timeForm, billable: e.target.checked })}
                        className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600"
                      />
                      Billable
                    </label>
                    <button
                      onClick={handleAddLog}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition"
                    >
                      Add time log
                    </button>
                  </div>
                )}

                {logs.length === 0 ? (
                  <p className="text-sm text-zinc-400">No time logged yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {logs.map((l) => {
                      const running = !l.endTime;
                      return (
                        <div
                          key={l._id}
                          className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                            {initials(l.userId)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                              {fmtDateTime(l.startTime)}
                              {l.endTime ? ` → ${fmtDateTime(l.endTime)}` : " → running"}
                            </p>
                            {l.notes && (
                              <p className="text-xs text-zinc-400 truncate">{l.notes}</p>
                            )}
                          </div>
                          <span className="text-xs text-zinc-400 shrink-0">
                            {running ? "running" : fmtMinutes(l.durationMinutes)}
                            {!l.billable && (
                              <span className="ml-1 text-zinc-400">· n/b</span>
                            )}
                          </span>
                          {(!running && (canManage || l.userId?._id === currentUserId)) && (
                            <button
                              onClick={() => handleDeleteLog(l._id)}
                              className="p-1 rounded text-zinc-400 hover:text-red-500 transition shrink-0"
                              title="Delete log"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Comments */}
              <section>
                <SectionTitle count={task.comments.length} title="Comments" />
                {canAct && (
                  <div className="mb-3 flex gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      placeholder="Write a comment..."
                      className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!commentText.trim()}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                )}
                {task.comments.length === 0 ? (
                  <p className="text-sm text-zinc-400">No comments.</p>
                ) : (
                  <div className="space-y-3">
                    {task.comments.map((c) => (
                      <div key={c._id} className="flex items-start gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold">
                          {initials(c.userId)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                              {displayName(c.userId)}
                            </span>
                            <span className="text-xs text-zinc-400">
                              {fmtDateTime(c.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                            {c.text}
                          </p>
                        </div>
                        {(canManage || c.userId?._id === currentUserId) && (
                          <button
                            onClick={() => handleDeleteComment(c._id)}
                            className="p-1 rounded text-zinc-400 hover:text-red-500 transition"
                            title="Delete comment"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Activity */}
              <section>
                <SectionTitle count={activity.length} title="Activity" />
                {activity.length === 0 ? (
                  <p className="text-sm text-zinc-400">No activity yet.</p>
                ) : (
                  <div className="space-y-3">
                    {activity.map((a) => (
                      <div key={a._id} className="flex items-start gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[11px] font-semibold">
                          {initials(a.userId)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-600 dark:text-zinc-300">
                            <span className="font-medium text-zinc-900 dark:text-zinc-50">
                              {displayName(a.userId)}
                            </span>{" "}
                            {fmtAction(a.action)} — {a.details}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {fmtDateTime(a.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
      {title} ({count})
    </h3>
  );
}
