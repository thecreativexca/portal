"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import Link from "next/link";
import FollowUpFormModal, {
  FollowUpRecord,
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_STATUS_LABELS,
} from "@/components/FollowUpFormModal";
import { UserOption } from "@/components/LeadFormModal";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

const CRM_ROLES = ["ceo", "hr", "project_manager", "team_lead", "accounts"];

type Value = Date | null;

export default function RemindersPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role && !CRM_ROLES.includes(role))
      redirect("/");
  }, [authStatus, role]);

  const fetchFollowUps = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/followups?${params}`);
      if (!res.ok) throw new Error("Failed to fetch follow-ups");
      const data = await res.json();
      setFollowUps(data.followUps || []);
    } catch (err) {
      console.error("Error fetching follow-ups:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?status=active&pageSize=200");
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  }, []);

  useEffect(() => {
    if (role && CRM_ROLES.includes(role)) {
      fetchFollowUps();
      fetchUsers();
    }
  }, [role, fetchFollowUps, fetchUsers]);

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const byDate = new Map<string, FollowUpRecord[]>();
  for (const f of followUps) {
    const k = dayKey(new Date(f.dueAt));
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(f);
  }

  const getTileContent = ({ date: tileDate }: { date: Date }) => {
    const list = byDate.get(dayKey(tileDate));
    if (!list || list.length === 0) return null;
    const hasOverdue = list.some(
      (f) => f.status === "pending" && new Date(f.dueAt) < new Date()
    );
    return (
      <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
        <span
          className={hasOverdue ? "badge badge-rose" : "badge badge-blue"}
          style={{ fontSize: 10, padding: "1px 6px", minWidth: 20, justifyContent: "center" }}
        >
          {list.length}
        </span>
      </div>
    );
  };

  const tileClassName = ({ date: tileDate }: { date: Date }) => {
    const list = byDate.get(dayKey(tileDate));
    if (!list || list.length === 0) return "";
    return list.some(
      (f) => f.status === "pending" && new Date(f.dueAt) < new Date()
    )
      ? "has-overdue"
      : "has-reminder";
  };

  const handleDateClick = (value: Value) => {
    if (value) setSelectedDate(value);
  };

  const markComplete = async (f: FollowUpRecord) => {
    try {
      await fetch(`/api/followups/${f._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      await fetchFollowUps();
    } catch (err) {
      console.error("Error completing follow-up:", err);
    }
  };

  const handleDelete = async (f: FollowUpRecord) => {
    if (!window.confirm("Delete this follow-up?")) return;
    try {
      await fetch(`/api/followups/${f._id}`, { method: "DELETE" });
      await fetchFollowUps();
    } catch (err) {
      console.error("Error deleting follow-up:", err);
    }
  };

  if (authStatus === "loading") {
    return <LoadingCenter />;
  }

  const canManage = role === "ceo" || role === "project_manager";

  const selectedKey = dayKey(selectedDate);
  const selectedFollowUps = (byDate.get(selectedKey) || []).sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  );

  const now = new Date();
  const upcoming = followUps
    .filter((f) => {
      const d = new Date(f.dueAt);
      return d >= now && d <= new Date(now.getTime() + 7 * 86400000);
    })
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const overdue = followUps
    .filter((f) => f.status === "pending" && new Date(f.dueAt) < now)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const pendingCount = followUps.filter((f) => f.status === "pending").length;
  const completedCount = followUps.filter((f) => f.status === "completed").length;

  return (
    <PageShell>
      <PageHeader
        title="Follow-up Reminders"
        description="Stay on top of scheduled calls, emails, and meetings"
        badge={<span className="count-chip">{followUps.length} reminders</span>}
        actions={
          <>
            <Link href="/crm" className="btn btn-ghost">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Pipeline
            </Link>
            {canManage && (
              <button onClick={() => setModalOpen(true)} className="btn btn-primary">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Schedule Follow-up
              </button>
            )}
          </>
        }
      />

      <div className="summary-strip">
        <div className="summary-item">
          <div className="tile tile-sm tile-blue">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : followUps.length}</div>
            <div className="summary-label">Total</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-amber">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : pendingCount}</div>
            <div className="summary-label">Pending</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-green">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : completedCount}</div>
            <div className="summary-label">Completed</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-rose">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : overdue.length}</div>
            <div className="summary-label">Overdue</div>
          </div>
        </div>
      </div>

      <FilterBar>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 140 }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
      </FilterBar>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {/* Calendar */}
        <div className="card">
          <div className="card-header">
            <h2>Calendar</h2>
          </div>
          <div className="card-body portal-calendar-wrap">
            <style jsx global>{`
              .portal-calendar-wrap .react-calendar {
                width: 100%;
                border: none;
                background: transparent;
                font-family: inherit;
              }
              .portal-calendar-wrap .react-calendar__navigation button {
                color: var(--fg);
                font-size: 0.95rem;
                font-weight: 600;
              }
              .portal-calendar-wrap .react-calendar__navigation button:enabled:hover,
              .portal-calendar-wrap .react-calendar__navigation button:enabled:focus {
                background: var(--bg-card2);
                border-radius: 8px;
              }
              .portal-calendar-wrap .react-calendar__month-view__weekdays__weekday {
                font-size: 0.75rem;
                font-weight: 600;
                color: var(--fg-muted);
                text-transform: uppercase;
                text-decoration: none;
                padding: 0.5rem 0;
              }
              .portal-calendar-wrap .react-calendar__month-view__weekdays__weekday abbr {
                text-decoration: none;
              }
              .portal-calendar-wrap .react-calendar__tile {
                padding: 0.55rem 0.25rem;
                font-size: 0.85rem;
                color: var(--fg);
                border-radius: 8px;
              }
              .portal-calendar-wrap .react-calendar__tile:enabled:hover,
              .portal-calendar-wrap .react-calendar__tile:enabled:focus {
                background: var(--bg-card2);
              }
              .portal-calendar-wrap .react-calendar__tile--active {
                background: var(--primary) !important;
                color: white !important;
              }
              .portal-calendar-wrap .react-calendar__tile--now {
                background: var(--primary-light);
              }
              .portal-calendar-wrap .has-reminder .react-calendar__tile {
                box-shadow: inset 0 -3px 0 var(--primary);
              }
              .portal-calendar-wrap .has-overdue .react-calendar__tile {
                box-shadow: inset 0 -3px 0 #f43f5e;
              }
              .portal-calendar-wrap .react-calendar__month-view__days__day--weekend {
                color: #f43f5e;
              }
              .portal-calendar-wrap .react-calendar__tile--disabled {
                color: var(--fg-subtle) !important;
              }
            `}</style>
            <Calendar
              onChange={(value) => handleDateClick(value as Date)}
              value={date}
              onActiveStartDateChange={({ activeStartDate }) =>
                activeStartDate && setDate(activeStartDate)
              }
              tileContent={getTileContent}
              tileClassName={tileClassName}
            />
            <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 12, color: "var(--fg-muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--primary)" }} />
                Reminder
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "#f43f5e" }} />
                Overdue
              </span>
            </div>
          </div>
        </div>

        {/* Selected day */}
        <div className="card">
          <div className="card-header">
            <h2>
              {selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h2>
            <span className="count-chip">{selectedFollowUps.length}</span>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="loading-center" style={{ padding: "24px 0" }}>
                <div className="spinner" />
                <span>Loading...</span>
              </div>
            ) : selectedFollowUps.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px 12px" }}>
                <p style={{ fontWeight: 600, color: "var(--fg)" }}>No reminders</p>
                <p>Nothing scheduled for this day.</p>
              </div>
            ) : (
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
                {selectedFollowUps.map((f) => (
                  <FollowUpItem
                    key={f._id}
                    f={f}
                    canManage={canManage}
                    onComplete={markComplete}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {/* Upcoming */}
        <div className="card">
          <div className="card-header">
            <h2>Upcoming (7 days)</h2>
            <span className="count-chip">{upcoming.length}</span>
          </div>
          <div className="card-body">
            {upcoming.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>Nothing coming up.</p>
            ) : (
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
                {upcoming.map((f) => (
                  <FollowUpItem
                    key={f._id}
                    f={f}
                    canManage={canManage}
                    onComplete={markComplete}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Overdue */}
        {overdue.length > 0 && (
          <div className="card" style={{ borderColor: "rgba(244, 63, 94, 0.35)" }}>
            <div className="card-header">
              <h2 style={{ color: "#f43f5e" }}>Overdue</h2>
              <span className="badge badge-rose">{overdue.length}</span>
            </div>
            <div className="card-body">
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
                {overdue.map((f) => (
                  <FollowUpItem
                    key={f._id}
                    f={f}
                    canManage={canManage}
                    onComplete={markComplete}
                    onDelete={handleDelete}
                    overdue
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <FollowUpFormModal
        open={modalOpen}
        followUp={null}
        users={users}
        onClose={() => setModalOpen(false)}
        onSaved={fetchFollowUps}
      />
    </PageShell>
  );
}

function FollowUpItem({
  f,
  canManage,
  onComplete,
  onDelete,
  overdue,
}: {
  f: FollowUpRecord;
  canManage: boolean;
  onComplete: (f: FollowUpRecord) => void;
  onDelete: (f: FollowUpRecord) => void;
  overdue?: boolean;
}) {
  const lead = f.leadId && typeof f.leadId !== "string" ? f.leadId : null;
  const opp =
    f.opportunityId && typeof f.opportunityId !== "string"
      ? f.opportunityId
      : null;

  const statusBadge =
    f.status === "completed"
      ? "badge badge-green"
      : overdue
      ? "badge badge-rose"
      : "badge badge-amber";

  return (
    <li
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
        background: "var(--bg-card2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg)", margin: 0 }}>
            {f.title}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4, fontSize: 11.5, color: "var(--fg-muted)" }}>
            <span className="badge badge-gray" style={{ fontSize: 10 }}>
              {FOLLOWUP_TYPE_LABELS[f.type] || f.type}
            </span>
            <span>
              {new Date(f.dueAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {lead && (
              <Link href={`/leads/${lead._id}`} style={{ color: "var(--primary)", textDecoration: "none" }}>
                {lead.companyName}
              </Link>
            )}
            {opp && (
              <Link href={`/opportunities/${opp._id}`} style={{ color: "var(--primary)", textDecoration: "none" }}>
                {opp.opportunityName}
              </Link>
            )}
          </div>
        </div>
        <span className={statusBadge} style={{ fontSize: 10, flexShrink: 0 }}>
          {f.status === "completed"
            ? FOLLOWUP_STATUS_LABELS.completed
            : overdue
            ? "Overdue"
            : FOLLOWUP_STATUS_LABELS.pending}
        </span>
      </div>
      {canManage && f.status !== "completed" && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button onClick={() => onComplete(f)} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}>
            Complete
          </button>
          <button onClick={() => onDelete(f)} className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
