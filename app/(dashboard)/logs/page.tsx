"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

interface LogEntry {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string } | null;
  action: string;
  details: string;
  timestamp: string;
}

interface LogStats {
  total: number;
  today: number;
  byAction: { _id: string; count: number }[];
}

const STATIC_ACTIONS = [
  "CREATE_USER", "UPDATE_USER", "DELETE_USER",
  "CHECK_IN", "CHECK_OUT",
  "APPLY_LEAVE", "APPROVE_LEAVE", "REJECT_LEAVE", "EDIT_LEAVE", "DELETE_LEAVE",
  "CREATE_PROJECT", "UPDATE_PROJECT", "DELETE_PROJECT",
  "CREATE_TASK", "UPDATE_TASK", "DELETE_TASK",
  "CREATE_APPROVAL", "APPROVE_APPROVAL", "REJECT_APPROVAL",
  "UPLOAD_DOCUMENT", "DELETE_DOCUMENT",
];

function dotClass(action: string): string {
  if (/CREATE/.test(action)) return "create";
  if (/DELETE|REJECT/.test(action)) return "delete";
  if (/UPDATE|EDIT/.test(action)) return "update";
  if (/APPROVE/.test(action)) return "approve";
  if (/CHECK_IN|CHECK_OUT/.test(action)) return "attendance";
  return "default";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function LogsPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setStats(data.stats);
      setTotalPages(data.pagination.totalPages);
    } catch {} finally {
      setLoading(false);
    }
  }, [actionFilter, page]);

  useEffect(() => {
    if (role === "ceo") fetchLogs();
  }, [fetchLogs, role]);

  useEffect(() => {
    if (role !== "ceo") return;
    pollingRef.current = setInterval(fetchLogs, 20000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchLogs, role]);

  if (authStatus === "loading") return <LoadingCenter />;

  const actions = Array.from(
    new Set([...STATIC_ACTIONS, ...(stats?.byAction || []).map((a) => a._id)])
  ).sort();

  const grouped: { date: string; key: string; entries: LogEntry[] }[] = [];
  const dayIndex = new Map<string, number>();
  for (const log of logs) {
    const d = new Date(log.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const label = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    let idx = dayIndex.get(key);
    if (idx === undefined) {
      idx = grouped.length;
      dayIndex.set(key, idx);
      grouped.push({ date: label, key, entries: [] });
    }
    grouped[idx].entries.push(log);
  }

  return (
    <PageShell>
      <PageHeader
        title="Activity Logs"
        description="Live audit trail of every action performed in the system"
        badge={
          stats ? (
            <span className="count-chip">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-green)", display: "inline-block" }} />
              Live
            </span>
          ) : undefined
        }
      />

      <div className="summary-strip">
        <div className="summary-item">
          <div className="tile tile-sm tile-blue">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{stats?.total ?? "\u2014"}</div>
            <div className="summary-label">Total Actions</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-green">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{stats?.today ?? "\u2014"}</div>
            <div className="summary-label">Today</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-amber">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{stats?.byAction?.length ?? "\u2014"}</div>
            <div className="summary-label">Action Types</div>
          </div>
        </div>
      </div>

      <FilterBar>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ minWidth: 200, flex: 1 }}
        >
          <option value="">All Actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
      </FilterBar>

      <div className="card">
        <div className="card-header">
          <h2>Timeline</h2>
          <span className="count-chip">{loading ? "\u2014" : logs.length} events</span>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="loading-center" style={{ padding: "40px 20px" }}>
              <div className="spinner" /><span>Loading activity...</span>
            </div>
          ) : grouped.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="icon">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No activity found</p>
              <p>Try changing the action filter above.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {grouped.map((day) => (
                <div key={day.key}>
                  <div className="audit-day-header">
                    <h3>{day.date}</h3>
                    <span className="count-chip">{day.entries.length} event{day.entries.length === 1 ? "" : "s"}</span>
                    <div className="line" />
                  </div>
                  <div className="audit-timeline">
                    {day.entries.map((log) => (
                      <div key={log._id} className="audit-entry">
                        <span className={`audit-dot ${dotClass(log.action)}`} />
                        <div className="audit-entry-card">
                          <div className="audit-entry-meta">
                            <span className="audit-entry-user">{log.userId?.name || "Deleted User"}</span>
                            <ActionBadge action={log.action} />
                            <span className="audit-entry-time">{formatTime(log.timestamp)}</span>
                          </div>
                          <p className="audit-entry-detail">{log.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-ghost" style={{ padding: "8px 16px" }}>Previous</button>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-ghost" style={{ padding: "8px 16px" }}>Next</button>
        </div>
      )}
    </PageShell>
  );
}

function ActionBadge({ action }: { action: string }) {
  const badgeMap: Record<string, string> = {
    CREATE_USER: "badge-green", UPDATE_USER: "badge-blue", DELETE_USER: "badge-rose",
    CHECK_IN: "badge-green", CHECK_OUT: "badge-gray",
    APPLY_LEAVE: "badge-amber", APPROVE_LEAVE: "badge-green", REJECT_LEAVE: "badge-rose",
    CREATE_PROJECT: "badge-blue", UPDATE_PROJECT: "badge-blue", DELETE_PROJECT: "badge-rose",
    CREATE_TASK: "badge-purple", UPDATE_TASK: "badge-blue", DELETE_TASK: "badge-rose",
    CREATE_APPROVAL: "badge-blue", APPROVE_APPROVAL: "badge-green", REJECT_APPROVAL: "badge-rose",
    UPLOAD_DOCUMENT: "badge-blue", DELETE_DOCUMENT: "badge-rose",
  };

  const label = action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span className={`badge ${badgeMap[action] || "badge-gray"}`} style={{ fontSize: 11 }}>
      {label}
    </span>
  );
}
