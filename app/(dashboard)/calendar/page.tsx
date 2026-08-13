"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

interface TaskEvent {
  title: string;
  project: string;
  status: string;
  priority: string;
}

interface LeaveEvent {
  reason: string;
  status: string;
  type: "start" | "end" | "middle";
}

interface DayEvents {
  date: string;
  tasks: TaskEvent[];
  leaves: LeaveEvent[];
}

type Value = Date | null;

export default function CalendarPage() {
  const { data: session, status: authStatus } = useSession();

  const [date, setDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<DayEvents[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<DayEvents | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
  }, [authStatus]);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      try {
        const res = await fetch(`/api/calendar?month=${month}`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch {} finally {
        setLoading(false);
      }
    };
    if (session) fetchEvents();
  }, [date, session]);

  const getTileContent = ({ date: tileDate }: { date: Date }) => {
    const key = tileDate.toISOString().split("T")[0];
    const day = events.find((e) => e.date === key);
    if (!day) return null;
    const count = day.tasks.length + day.leaves.length;
    if (count === 0) return null;
    return (
      <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
        <span style={{
          display: "flex", height: 18, width: 18, alignItems: "center", justifyContent: "center",
          borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)",
          fontSize: 9, fontWeight: 800,
        }}>
          {count}
        </span>
      </div>
    );
  };

  const tileClassName = ({ date: tileDate }: { date: Date }) => {
    const key = tileDate.toISOString().split("T")[0];
    const day = events.find((e) => e.date === key);
    if (!day) return "";
    if (day.tasks.length > 0 && day.leaves.length > 0) return "has-both";
    if (day.leaves.length > 0) return "has-leave";
    if (day.tasks.length > 0) return "has-task";
    return "";
  };

  const handleDateClick = (value: Value) => {
    if (!value) return;
    const key = value.toISOString().split("T")[0];
    setSelectedEvents(events.find((e) => e.date === key) || { date: key, tasks: [], leaves: [] });
  };

  if (authStatus === "loading") return <LoadingCenter />;

  const selectedLabel = selectedEvents
    ? new Date(selectedEvents.date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
      })
    : null;

  return (
    <PageShell>
      <PageHeader
        title="Calendar"
        description="View task deadlines and leave dates across the team"
        badge={
          <span className="date-chip">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75" />
            </svg>
            {date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        }
      />

      <div className="calendar-layout">
        <div className="card">
          <div className="card-header">
            <h2>Month View</h2>
            <div className="calendar-legend" style={{ margin: 0 }}>
              <span className="calendar-legend-item">
                <span className="calendar-legend-dot task" /> Tasks
              </span>
              <span className="calendar-legend-item">
                <span className="calendar-legend-dot leave" /> Leave
              </span>
              <span className="calendar-legend-item">
                <span className="calendar-legend-dot both" /> Both
              </span>
            </div>
          </div>
          <div className="card-body portal-calendar">
            <Calendar
              onChange={(value) => handleDateClick(value as Date)}
              value={date}
              onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setDate(activeStartDate)}
              tileContent={getTileContent}
              tileClassName={tileClassName}
            />
          </div>
        </div>

        <div className="card" style={{ height: "fit-content" }}>
          <div className="card-header">
            <h2>{selectedLabel || "Day Details"}</h2>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="loading-center" style={{ padding: "24px 0" }}>
                <div className="spinner" />
                <span>Loading events...</span>
              </div>
            ) : !selectedEvents ? (
              <div className="empty-state" style={{ padding: "24px 0" }}>
                <div className="icon">
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75" />
                  </svg>
                </div>
                <p style={{ fontWeight: 600, color: "var(--fg)" }}>Pick a date</p>
                <p>Tap any date on the calendar to see tasks and leaves.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {selectedEvents.tasks.length > 0 && (
                  <div>
                    <p className="modal-section-title" style={{ marginTop: 0 }}>Tasks Due</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {selectedEvents.tasks.map((t, i) => (
                        <div key={i} className="calendar-event-item">
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg)", margin: 0 }}>{t.title}</p>
                          <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "4px 0 0" }}>{t.project}</p>
                          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <span className="badge badge-gray" style={{ textTransform: "capitalize" }}>{t.status}</span>
                            <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{t.priority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEvents.leaves.length > 0 && (
                  <div>
                    <p className="modal-section-title" style={{ marginTop: selectedEvents.tasks.length > 0 ? 20 : 0 }}>Leave</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {selectedEvents.leaves.map((l, i) => (
                        <div key={i} className="calendar-event-item leave">
                          <p style={{ fontSize: 13.5, color: "var(--fg)", margin: 0 }}>{l.reason}</p>
                          <span className={`badge ${
                            l.status === "approved" ? "badge-green" :
                            l.status === "rejected" ? "badge-rose" : "badge-amber"
                          }`} style={{ marginTop: 8, textTransform: "capitalize" }}>
                            {l.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEvents.tasks.length === 0 && selectedEvents.leaves.length === 0 && (
                  <div className="empty-state" style={{ padding: "16px 0" }}>
                    <p style={{ fontWeight: 600, color: "var(--fg)" }}>Nothing scheduled</p>
                    <p>No tasks or leaves on this day.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
