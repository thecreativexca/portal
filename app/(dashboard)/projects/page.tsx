"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProjectFormModal, {
  ProjectRecord,
  UserOption,
  ClientOption,
} from "@/components/ProjectFormModal";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

interface MilestoneSummary {
  total: number;
  completed: number;
  overdue: number;
}

interface TaskSummary {
  total: number;
  done: number;
}

interface PortfolioProject extends ProjectRecord {
  clientId?: { _id: string; clientName: string } | null;
  projectManagerId?: {
    _id: string;
    fullName: string;
    name: string;
    email: string;
  } | null;
  health: "on-track" | "at-risk" | "delayed" | "completed";
  daysUntilEnd: number | null;
  overdue: boolean;
  budgetConsumed: number;
  budgetRemaining: number;
  hoursUtilizationPct: number | null;
  milestoneSummary: MilestoneSummary;
  taskSummary: TaskSummary;
}

interface Summary {
  total: number;
  active: number;
  completed: number;
  onHold: number;
  onTrack: number;
  atRisk: number;
  delayed: number;
  overdue: number;
  budgetTotal: number;
  hoursEstimated: number;
  hoursActual: number;
}

const MANAGE_ROLES = ["ceo", "project_manager", "team_lead"];

const STATUS_BADGE: Record<string, string> = {
  active: "badge badge-green",
  completed: "badge badge-blue",
  "on-hold": "badge badge-amber",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  "on-hold": "On Hold",
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#f43f5e",
  high: "#f59e0b",
  medium: "#1d6af5",
  low: "#8ba3be",
};

const HEALTH_BADGE: Record<string, string> = {
  "on-track": "badge badge-green",
  "at-risk": "badge badge-amber",
  delayed: "badge badge-rose",
  completed: "badge badge-blue",
};

const HEALTH_LABEL: Record<string, string> = {
  "on-track": "On Track",
  "at-risk": "At Risk",
  delayed: "Delayed",
  completed: "Completed",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function initials(name?: string | null) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "P";
}

function progressColor(progress: number): string {
  if (progress >= 100) return "#10b981";
  if (progress >= 60) return "#1d6af5";
  if (progress >= 30) return "#f59e0b";
  return "#8ba3be";
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;

  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  // Modal / delete state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState<PortfolioProject | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "12");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (clientFilter) params.set("clientId", clientFilter);
      const res = await fetch(`/api/projects?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProjects(data.projects || []);
      setSummary(data.summary);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter, clientFilter]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users?status=active&pageSize=200");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {}
  };

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients?pageSize=100");
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (role) {
      fetchProjects();
      if (MANAGE_ROLES.includes(role)) {
        fetchUsers();
        fetchClients();
      }
    }
  }, [role, fetchProjects]);

  const canManage = role && MANAGE_ROLES.includes(role);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/projects/${deleting._id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error);
        return;
      }
      setDeleting(null);
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (p: PortfolioProject) => {
    setEditing(p);
    setModalOpen(true);
  };

  const hasFilters = search !== "" || statusFilter !== "" || priorityFilter !== "" || clientFilter !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setClientFilter("");
    setPage(1);
  };

  if (status === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Project Portfolio"
        description="Track every project across clients, milestones, budget, and deadlines"
        badge={
          <span className="count-chip">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            {summary?.total ?? 0} projects
          </span>
        }
        actions={
          canManage ? (
            <button onClick={openCreate} className="btn btn-primary">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Project
            </button>
          ) : undefined
        }
      />

      {/* Summary strip */}
      {!loading && summary && (
        <div className="summary-strip">
          <div className="summary-item">
            <div className="tile tile-sm tile-blue">
              <IconBriefcase />
            </div>
            <div>
              <div className="summary-num">{summary.total ?? 0}</div>
              <div className="summary-label">Total Projects</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-green">
              <IconCheck />
            </div>
            <div>
              <div className="summary-num">{summary.active ?? 0}</div>
              <div className="summary-label">Active</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-rose">
              <IconClock />
            </div>
            <div>
              <div className="summary-num">{summary.overdue ?? 0}</div>
              <div className="summary-label">Overdue</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-amber">
              <IconWarning />
            </div>
            <div>
              <div className="summary-num">{summary.atRisk ?? 0}</div>
              <div className="summary-label">At Risk</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-purple">
              <IconMoney />
            </div>
            <div>
              <div className="summary-num" style={{ fontSize: 16 }}>{fmt(summary.budgetTotal ?? 0)}</div>
              <div className="summary-label">Total Budget</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-cyan">
              <IconClock2 />
            </div>
            <div>
              <div className="summary-num">{Math.round(summary.hoursActual ?? 0)}h</div>
              <div className="summary-label">Hours Logged</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <FilterBar>
        <div className="search-wrap" style={{ flex: "1 1 240px", minWidth: 0 }}>
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or code..."
            className="input"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 120 }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="on-hold">On Hold</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 120 }}
        >
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select
          value={clientFilter}
          onChange={(e) => {
            setClientFilter(e.target.value);
            setPage(1);
          }}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 120 }}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>
              {c.clientName}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="btn btn-ghost" style={{ padding: "8px 14px" }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
      </FilterBar>

      {/* Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div className="skeleton" style={{ height: 44, width: 44, marginBottom: 14, borderRadius: 12 }} />
              <div className="skeleton" style={{ height: 15, width: 140, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 11, width: 200, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 11, width: 160 }} />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: "var(--fg)" }}>
              {hasFilters ? "No projects match your filters" : "No projects found"}
            </p>
            <p>
              {hasFilters
                ? "Try clearing the filters."
                : canManage
                ? "Click â€œNew Projectâ€ to create one."
                : "Projects will appear here once created."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const alert =
              p.status === "completed"
                ? null
                : p.overdue
                ? {
                    type: "delayed",
                    text:
                      p.milestoneSummary.overdue > 0
                        ? `${p.milestoneSummary.overdue} overdue milestone${p.milestoneSummary.overdue === 1 ? "" : "s"}`
                        : "Past deadline",
                  }
                : p.daysUntilEnd !== null && p.daysUntilEnd <= 7
                ? { type: "due", text: `Due in ${p.daysUntilEnd} day${p.daysUntilEnd === 1 ? "" : "s"}` }
                : null;

            return (
              <div key={p._id} className="card card-hover flex flex-col">
                <Link href={`/projects/${p._id}`} className="block p-5 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="dept-icon" style={{ background: "linear-gradient(135deg,#1d6af5,#0ea5e9)", width: 42, height: 42, fontSize: 13 }}>
                        {initials(p.projectName)}
                      </div>
                      <div className="min-w-0">
                        <h3 style={{ fontWeight: 700, fontSize: 14, color: "var(--fg)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.projectName || "Untitled Project"}
                        </h3>
                        <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.projectCode || "â€”"}
                          {p.clientId ? ` Â· ${p.clientId.clientName}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`badge ${STATUS_BADGE[p.status] || "badge badge-gray"}`}>
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </div>

                  <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "10px 0 0", lineHeight: 1.55 }} className="line-clamp-2">
                    {p.description}
                  </p>

                  {/* Deadline alert */}
                  {alert && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 12,
                        padding: "5px 10px",
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 600,
                        background:
                          alert.type === "delayed"
                            ? "rgba(244,63,94,0.10)"
                            : "rgba(245,158,11,0.12)",
                        color:
                          alert.type === "delayed"
                            ? "#e11d48"
                            : "#d97706",
                      }}
                    >
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      {alert.text}
                    </div>
                  )}

                  {/* Progress */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
                      <span style={{ color: "var(--fg-muted)" }}>Progress</span>
                      <span style={{ fontWeight: 700, color: "var(--fg)" }}>{p.progress}%</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: "var(--bg-card2)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 99,
                          background: progressColor(p.progress),
                          transition: "width 0.3s ease",
                          width: `${p.progress}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Milestones + tasks + health */}
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11.5, color: "var(--fg-muted)" }}>
                    <span>
                      {p.milestoneSummary.total > 0
                        ? `${p.milestoneSummary.completed}/${p.milestoneSummary.total} milestones`
                        : "No milestones"}
                      {p.milestoneSummary.overdue > 0 && (
                        <span style={{ color: "#e11d48", fontWeight: 600 }}> Â· {p.milestoneSummary.overdue} overdue</span>
                      )}
                    </span>
                    <span>
                      {p.taskSummary.done}/{p.taskSummary.total} tasks
                    </span>
                    <span className={`badge ${HEALTH_BADGE[p.health] || "badge badge-gray"}`} style={{ fontSize: 10.5 }}>
                      {HEALTH_LABEL[p.health]}
                    </span>
                  </div>

                  {/* Budget / hours */}
                  {(p.budget || p.estimatedHours) && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5 }}>
                      <span style={{ color: "var(--fg-muted)" }}>
                        Budget <span style={{ fontWeight: 700, color: "var(--fg)" }}>{fmt(p.budget || 0)}</span>
                      </span>
                      {p.estimatedHours ? (
                        <span style={{ fontWeight: 600, color: p.hoursUtilizationPct && p.hoursUtilizationPct > 100 ? "#e11d48" : "var(--fg-muted)" }}>
                          {Math.round(p.actualHours || 0)}/{p.estimatedHours} hrs
                        </span>
                      ) : null}
                    </div>
                  )}
                </Link>

                {/* Team avatars + PM */}
                <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    {p.teamMemberIds.slice(0, 4).map((m) => (
                      <span
                        key={m._id}
                        className="avatar avatar-sm tile-blue"
                        style={{ width: 26, height: 26, fontSize: 10, boxShadow: "none", border: "2px solid var(--bg-card)" }}
                        title={m.fullName || m.name}
                      >
                        {(m.fullName || m.name).charAt(0).toUpperCase()}
                      </span>
                    ))}
                    {p.teamMemberIds.length > 4 && (
                      <span style={{ fontSize: 11, color: "var(--fg-subtle)", marginLeft: 2 }}>
                        +{p.teamMemberIds.length - 4}
                      </span>
                    )}
                    {p.projectManagerId && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--fg-muted)", marginLeft: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="Project manager">
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ color: "var(--primary)", flexShrink: 0 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {p.projectManagerId.name || p.projectManagerId.fullName}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: PRIORITY_COLOR[p.priority] || "#8ba3be", flexShrink: 0 }}>
                    {p.priority}
                  </span>
                </div>

                {canManage && (
                  <div style={{ padding: "0 14px 12px", display: "flex", justifyContent: "flex-end", gap: 2, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        openEdit(p);
                      }}
                      className="icon-btn primary"
                      title="Edit project"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                    {role === "ceo" && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setDeleting(p);
                        }}
                        className="icon-btn danger"
                        title="Delete project"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && projects.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0 }}>
            Page <span style={{ fontWeight: 700, color: "var(--fg)" }}>{page}</span> of {totalPages}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-ghost"
              style={{ padding: "8px 16px" }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn btn-ghost"
              style={{ padding: "8px 16px" }}
            >
              Next
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      <ProjectFormModal
        open={modalOpen}
        project={editing}
        clients={clients}
        users={users}
        onClose={() => setModalOpen(false)}
        onSaved={() => fetchProjects()}
      />

      {/* Delete confirmation */}
      {deleting && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Delete Project</h2>
              <button onClick={() => setDeleting(null)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--fg-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
                This will permanently delete <span style={{ fontWeight: 700, color: "var(--fg)" }}>{deleting.projectName}</span> and all
                its tasks and milestones. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeleting(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleDelete} className="btn btn-danger">Delete Project</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function IconBriefcase() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconWarning() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
function IconMoney() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconClock2() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
    </svg>
  );
}