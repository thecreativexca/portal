"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  TaskRecord,
  TaskStatus,
  TASK_STATUSES,
  STATUS_META,
  PRIORITY_META,
  WorkloadRow,
  TimeLogRecord,
  displayName,
  initials,
  fmtDate,
  fmtMinutes,
  fmtDateTime,
  fmtElapsed,
  isOverdue,
} from "@/lib/taskTypes";
import TaskFormModal from "@/components/TaskFormModal";
import TaskDrawer from "@/components/TaskDrawer";
import { PageShell, PageHeader, FilterBar, LoadingCenter } from "@/components/portal";

type Tab = "board" | "time" | "workload";

interface ProjectOption {
  _id: string;
  projectName: string;
  status?: string;
}
interface UserOption {
  _id: string;
  fullName?: string;
  name?: string;
  email: string;
}
interface ActiveTimer {
  _id: string;
  taskId: string;
  taskTitle?: string;
  startTime: string;
}

const MANAGE_ROLES = ["ceo", "project_manager", "team_lead"];

export default function TasksPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  const canManage = !!role && MANAGE_ROLES.includes(role);

  const [tab, setTab] = useState<Tab>("board");

  // Board state
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [filters, setFilters] = useState({
    projectId: "",
    assigneeId: "",
    search: "",
    myTasks: false,
    overdueOnly: false,
  });
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  // Modal / drawer
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  // Timer
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [now, setNow] = useState(0);

  // My time
  const [myLogs, setMyLogs] = useState<TimeLogRecord[]>([]);
  const [timeRange, setTimeRange] = useState(() => {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    return {
      from: from.toISOString().slice(0, 10),
      to: d.toISOString().slice(0, 10),
    };
  });

  // Workload
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [workloadTotals, setWorkloadTotals] = useState({
    tasksAssigned: 0,
    tasksDone: 0,
    overdue: 0,
    loggedMinutes: 0,
  });

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?pageSize=100");
      if (res.ok) {
        const data = await res.json();
        setProjects(
          (data.projects || []).map((p: any) => ({
            _id: p._id,
            projectName: p.projectName,
            status: p.status,
          }))
        );
      }
    } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?status=active&pageSize=200");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {}
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.projectId) params.set("projectId", filters.projectId);
      if (filters.assigneeId) params.set("userId", filters.assigneeId);
      if (filters.search) params.set("search", filters.search);
      if (filters.overdueOnly) params.set("overdue", "true");
      if (filters.myTasks && userId) params.set("userId", userId);

      const res = await fetch(`/api/tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [filters, userId]);

  const fetchActiveTimer = useCallback(async () => {
    try {
      const res = await fetch("/api/timer/active");
      if (res.ok) {
        const data = await res.json();
        const t = data.timer;
        setActiveTimer(
          t
            ? {
                _id: t._id,
                taskId:
                  typeof t.taskId === "object" ? t.taskId._id : t.taskId,
                taskTitle:
                  typeof t.taskId === "object" ? t.taskId.title : undefined,
                startTime: t.startTime,
              }
            : null
        );
      }
    } catch {}
  }, []);

  const fetchMyTime = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/time?from=${timeRange.from}&to=${timeRange.to}`
      );
      if (res.ok) {
        const data = await res.json();
        setMyLogs(data.logs || []);
      }
    } catch {}
  }, [timeRange]);

  const fetchWorkload = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.projectId) params.set("projectId", filters.projectId);
      params.set("from", timeRange.from);
      params.set("to", timeRange.to);
      const res = await fetch(`/api/workload?${params}`);
      if (res.ok) {
        const data = await res.json();
        setWorkload(data.workload || []);
        setWorkloadTotals(data.totals || workloadTotals);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.projectId, timeRange]);

  // Initial load
  useEffect(() => {
    if (userId) {
      fetchProjects();
      fetchUsers();
      fetchActiveTimer();
    }
  }, [userId, fetchProjects, fetchUsers, fetchActiveTimer]);

  // Load board
  useEffect(() => {
    if (userId) fetchTasks();
  }, [userId, fetchTasks]);

  // Ticking clock while a timer runs
  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchTasks(),
      fetchActiveTimer(),
      fetchMyTime(),
      fetchWorkload(),
    ]);
  }, [fetchTasks, fetchActiveTimer, fetchMyTime, fetchWorkload]);

  const startTimer = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.ok) {
        await fetchActiveTimer();
        setNow(Date.now());
      } else {
        const d = await res.json();
        alert(d.error || "Could not start timer");
      }
    } catch {}
  };

  const stopTimer = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (res.ok) {
        await refreshAll();
      } else {
        const d = await res.json();
        alert(d.error || "Could not stop timer");
      }
    } catch {}
  };

  const openCreate = () => {
    setEditingTask(null);
    setModalOpen(true);
  };

  const openEdit = (task: TaskRecord) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const moveTask = (taskId: string, status: TaskStatus) => {
    const prev = tasks;
    setTasks((ts) =>
      ts.map((t) => (t._id === taskId ? { ...t, status } : t))
    );
    fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((res) => {
      if (!res.ok) setTasks(prev);
    });
  };

  const onCardDragStart = (
    e: React.DragEvent,
    taskId: string,
    status: TaskStatus
  ) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.setData("text/task-status", status);
    e.dataTransfer.effectAllowed = "move";
  };

  const onColumnDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) moveTask(taskId, status);
  };

  const myTimeTotal = myLogs.reduce(
    (s, l) => s + (l.endTime ? l.durationMinutes || 0 : 0),
    0
  );

  // Group tasks into columns
  const columns = useMemo(() => {
    const map = new Map<TaskStatus, TaskRecord[]>();
    TASK_STATUSES.forEach((s) => map.set(s, []));
    tasks.forEach((t) => {
      const list = map.get(t.status);
      if (list) list.push(t);
    });
    TASK_STATUSES.forEach((s) => {
      map.get(s)!.sort((a, b) => {
        const pa = PRIORITY_META[a.priority]?.rank || 0;
        const pb = PRIORITY_META[b.priority]?.rank || 0;
        if (pa !== pb) return pb - pa;
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return da - db;
      });
    });
    return map;
  }, [tasks]);

  const elapsedMs = activeTimer
    ? now - new Date(activeTimer.startTime).getTime()
    : 0;

  const isMyLog = (l: TimeLogRecord) =>
    typeof l.taskId === "object" ? l.taskId?._id : l.taskId;

  const overdueCount = tasks.filter((t) => isOverdue(t)).length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const inProgressCount = tasks.filter((t) => t.status === "in-progress").length;

  if (authStatus === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Tasks"
        description="Plan, track, and time your team's work"
        badge={tasks.length > 0 ? <span className="count-chip">{tasks.length} tasks</span> : undefined}
        actions={
          <>
            {activeTimer && (
              <button
                onClick={() => setDrawerTaskId(activeTimer.taskId)}
                className="btn btn-secondary"
                style={{
                  borderColor: "rgba(244, 63, 94, 0.35)",
                  background: "rgba(244, 63, 94, 0.08)",
                  color: "var(--rose)",
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "#f43f5e", animation: "pulse 1.5s infinite" }} />
                <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeTimer.taskTitle || "Timer running"}
                </span>
                <span style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
                  {fmtElapsed(elapsedMs)}
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    stopTimer(activeTimer.taskId);
                  }}
                  style={{
                    marginLeft: 4,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "2px 6px",
                    borderRadius: 6,
                    background: "#f43f5e",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                  title="Stop timer"
                >
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z" />
                  </svg>
                </span>
              </button>
            )}
            {canManage && (
              <button onClick={openCreate} className="btn btn-primary">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Task
              </button>
            )}
          </>
        }
      />

      {/* Tabs */}
      <div className="tab-bar">
        {(
          [
            ["board", "Board"],
            ["time", "My Time"],
            ["workload", "Workload"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`tab-btn ${tab === key ? "active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ============ BOARD ============ */}
      {tab === "board" && (
        <>
          {!loading && tasks.length > 0 && (
            <div className="summary-strip">
              <div className="summary-item">
                <div className="tile tile-sm tile-blue">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{tasks.length}</div>
                  <div className="summary-label">Total Tasks</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-amber">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{inProgressCount}</div>
                  <div className="summary-label">In Progress</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-green">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{doneCount}</div>
                  <div className="summary-label">Done</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-rose">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{overdueCount}</div>
                  <div className="summary-label">Overdue</div>
                </div>
              </div>
            </div>
          )}

          <FilterBar>
            <div className="search-wrap" style={{ flex: "1 1 200px", minWidth: 0 }}>
              <svg className="search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
                placeholder="Search tasks..."
                className="input"
              />
            </div>
            <select
              value={filters.projectId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, projectId: e.target.value }))
              }
              className="input"
              style={{ width: "auto", flex: "0 0 auto", minWidth: 140 }}
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.projectName}
                </option>
              ))}
            </select>
            {role !== "employee" && (
              <select
                value={filters.assigneeId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, assigneeId: e.target.value }))
                }
                className="input"
                style={{ width: "auto", flex: "0 0 auto", minWidth: 140 }}
              >
                <option value="">All Assignees</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName || u.name}
                  </option>
                ))}
              </select>
            )}
            {role !== "employee" && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-muted)", cursor: "pointer", flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={filters.myTasks}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, myTasks: e.target.checked }))
                  }
                />
                My tasks
              </label>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-muted)", cursor: "pointer", flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={filters.overdueOnly}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, overdueOnly: e.target.checked }))
                }
              />
              Overdue only
            </label>
          </FilterBar>

          {/* Kanban board */}
          <div className="flex gap-4 overflow-x-auto pb-4">
            {TASK_STATUSES.map((status) => {
              const colTasks = columns.get(status) || [];
              return (
                <div
                  key={status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStatus(status);
                  }}
                  onDragLeave={() => setDragOverStatus(null)}
                  onDrop={(e) => onColumnDrop(e, status)}
                  className={`kanban-col ${
                    dragOverStatus === status
                      ? "!border-indigo-400 dark:!border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900/50"
                      : STATUS_META[status].column
                  }`}
                >
                  <div className="kanban-col-head">
                    <span className={`dot ${STATUS_META[status].dot}`} />
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      {STATUS_META[status].label}
                    </h3>
                    <span className="count-chip ml-auto">{colTasks.length}</span>
                  </div>
                  <div className="kanban-col-body">
                    {loading ? (
                      <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 animate-pulse h-20" />
                    ) : (
                      colTasks.map((task) => {
                        const overdue = isOverdue(task);
                        const canAct =
                          canManage || task.assignedTo?._id === userId;
                        return (
                          <div
                            key={task._id}
                            draggable={canAct}
                            onDragStart={(e) =>
                              onCardDragStart(e, task._id, task.status)
                            }
                            onClick={() => setDrawerTaskId(task._id)}
                            className={`kanban-card ${canAct ? "" : "opacity-90"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 leading-snug">
                                {task.title}
                              </p>
                              <span
                                className={`text-[11px] font-semibold shrink-0 ${
                                  PRIORITY_META[task.priority]?.text
                                }`}
                              >
                                {task.priority}
                              </span>
                            </div>

                            {task.labels.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {task.labels.slice(0, 3).map((l) => (
                                  <span
                                    key={l}
                                    className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 text-[10px] font-medium"
                                  >
                                    {l}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="mt-2.5 flex items-center gap-3 text-[11px] text-zinc-400">
                              <span
                                className="inline-flex items-center gap-1"
                                title={displayName(task.assignedTo)}
                              >
                                <span className="tile tile-xs tile-cyan">{initials(task.assignedTo)}</span>
                                {displayName(task.assignedTo)}
                              </span>
                              {task.dueDate && (
                                <span
                                  className={
                                    overdue
                                      ? "text-red-600 dark:text-red-400 font-medium"
                                      : ""
                                  }
                                >
                                  {fmtDate(task.dueDate)}
                                </span>
                              )}
                              <span className="ml-auto inline-flex items-center gap-2">
                                {!task.billable && (
                                  <span title="Non-billable">$</span>
                                )}
                                {task.dependencyTaskIds.length > 0 && (
                                  <span
                                    title="Dependencies"
                                    className="inline-flex items-center gap-0.5"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                    </svg>
                                    {task.dependencyTaskIds.length}
                                  </span>
                                )}
                                <span
                                  className="inline-flex items-center gap-0.5"
                                  title={`${task.comments.length} comments`}
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                                  </svg>
                                  {task.comments.length}
                                </span>
                                {task.loggedMinutes > 0 && (
                                  <span title={`${fmtMinutes(task.loggedMinutes)} logged`}>
                                    {fmtMinutes(task.loggedMinutes)}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ============ MY TIME ============ */}
      {tab === "time" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>My time</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {timeRange.from} to {timeRange.to}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={timeRange.from}
                onChange={(e) =>
                  setTimeRange((r) => ({ ...r, from: e.target.value }))
                }
                className="input"
                style={{ width: "auto", minWidth: 130, fontSize: 12, padding: "6px 10px" }}
              />
              <span className="text-zinc-400 text-xs">â†’</span>
              <input
                type="date"
                value={timeRange.to}
                onChange={(e) =>
                  setTimeRange((r) => ({ ...r, to: e.target.value }))
                }
                className="input"
                style={{ width: "auto", minWidth: 130, fontSize: 12, padding: "6px 10px" }}
              />
            </div>
          </div>
          <div className="card-body">
            <div className="summary-strip" style={{ marginBottom: 16 }}>
              <div className="summary-item">
                <div className="tile tile-sm tile-blue">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{fmtMinutes(myTimeTotal)}</div>
                  <div className="summary-label">Total Logged</div>
                </div>
              </div>
              <div className="summary-item">
                <div className="tile tile-sm tile-purple">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <div>
                  <div className="summary-num">{myLogs.length}</div>
                  <div className="summary-label">Time Entries</div>
                </div>
              </div>
            </div>
            {myLogs.length === 0 ? (
              <p className="py-10 text-sm text-zinc-400 text-center">
                No time logged in this period. Start a timer from a task card.
              </p>
            ) : (
              <div className="space-y-2">
                {myLogs.map((l) => {
                  const running = !l.endTime;
                  const taskId = isMyLog(l);
                  return (
                    <div key={l._id} className="time-log-row">
                      <span
                        className={`dot shrink-0 ${
                          running ? "bg-red-500 animate-pulse" : "bg-emerald-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => taskId && setDrawerTaskId(taskId)}
                          className="text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:text-indigo-600 dark:hover:text-indigo-400 truncate"
                        >
                          {typeof l.taskId === "object"
                            ? l.taskId?.title || "Task"
                            : "Task"}
                        </button>
                        <p className="text-xs text-zinc-400 truncate">
                          {fmtDateTime(l.startTime)}
                          {l.endTime ? ` â†’ ${fmtDateTime(l.endTime)}` : " â†’ running"}
                          {l.notes ? ` Â· ${l.notes}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {running ? "running" : fmtMinutes(l.durationMinutes)}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {l.billable ? "billable" : "non-billable"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ WORKLOAD ============ */}
      {tab === "workload" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Team workload</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {timeRange.from} to {timeRange.to}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={timeRange.from}
                onChange={(e) =>
                  setTimeRange((r) => ({ ...r, from: e.target.value }))
                }
                className="input"
                style={{ width: "auto", minWidth: 130, fontSize: 12, padding: "6px 10px" }}
              />
              <span className="text-zinc-400 text-xs">â†’</span>
              <input
                type="date"
                value={timeRange.to}
                onChange={(e) =>
                  setTimeRange((r) => ({ ...r, to: e.target.value }))
                }
                className="input"
                style={{ width: "auto", minWidth: 130, fontSize: 12, padding: "6px 10px" }}
              />
            </div>
          </div>
          {workload.length === 0 ? (
            <div className="card-body">
              <p className="py-10 text-sm text-zinc-400 text-center">
                No workload data in this period.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="text-center">Assigned</th>
                    <th className="text-center">In Prog.</th>
                    <th className="text-center">Done</th>
                    <th className="text-center">Overdue</th>
                    <th className="text-center">Est. hrs</th>
                    <th className="text-center">Logged</th>
                    <th className="w-44">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((w) => {
                    const over =
                      w.estimatedHours > 0 &&
                      w.loggedHours > w.estimatedHours;
                    return (
                      <tr key={w._id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span className="tile tile-sm tile-cyan">
                              {initials({
                                _id: w._id,
                                fullName: w.fullName,
                                name: w.name,
                                email: w.email,
                              })}
                            </span>
                            <div>
                              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                                {w.fullName || w.name}
                              </p>
                              <p className="text-xs text-zinc-400 capitalize">
                                {w.role?.replace("_", " ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center text-zinc-700 dark:text-zinc-300">
                          {w.tasksAssigned}
                        </td>
                        <td className="text-center text-zinc-700 dark:text-zinc-300">
                          {w.tasksInProgress}
                        </td>
                        <td className="text-center text-emerald-600 dark:text-emerald-400">
                          {w.tasksDone}
                        </td>
                        <td className="text-center">
                          {w.overdue > 0 ? (
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              {w.overdue}
                            </span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>
                        <td className="text-center text-zinc-700 dark:text-zinc-300">
                          {w.estimatedHours || 0}
                        </td>
                        <td
                          className={`text-center font-medium ${
                            over
                              ? "text-red-600 dark:text-red-400"
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {w.loggedHours.toFixed(1)}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  w.utilization !== null && w.utilization > 100
                                    ? "bg-red-500"
                                    : w.utilization !== null && w.utilization > 80
                                    ? "bg-amber-500"
                                    : "bg-emerald-600 dark:bg-emerald-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, w.utilization ?? 0)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 w-10 text-right">
                              {w.utilization !== null
                                ? `${w.utilization}%`
                                : "â€”"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Task create/edit modal */}
      <TaskFormModal
        open={modalOpen}
        task={editingTask}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setEditingTask(null);
          refreshAll();
        }}
      />

      {/* Task detail drawer */}
      <TaskDrawer
        taskId={drawerTaskId}
        open={!!drawerTaskId}
        onClose={() => setDrawerTaskId(null)}
        onChanged={refreshAll}
        canManage={canManage}
        currentUserId={userId || ""}
        activeTimer={
          activeTimer
            ? {
                _id: activeTimer._id,
                taskId: activeTimer.taskId,
                startTime: activeTimer.startTime,
              }
            : null
        }
        onStartTimer={startTimer}
        onStopTimer={stopTimer}
        onEdit={(t) => openEdit(t)}
      />
    </PageShell>
  );
}
