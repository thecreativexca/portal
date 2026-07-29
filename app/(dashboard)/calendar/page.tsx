"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

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
type RangeValue = [Date, Date] | null;

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
      <div className="flex justify-center mt-0.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
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

  const handleDateClick = (value: Value, _event: any) => {
    if (!value) return;
    const key = value.toISOString().split("T")[0];
    const day = events.find((e) => e.date === key) || null;
    setSelectedEvents(day);
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
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Calendar</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          View task deadlines and leave dates
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        {/* Calendar */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
          <style jsx global>{`
            .react-calendar {
              width: 100%;
              border: none;
              background: transparent;
              font-family: inherit;
            }
            .react-calendar__navigation button {
              color: #18181b;
              font-size: 0.95rem;
              font-weight: 600;
            }
            .dark .react-calendar__navigation button {
              color: #f4f4f5;
            }
            .react-calendar__navigation button:enabled:hover,
            .react-calendar__navigation button:enabled:focus {
              background: #e4e4e7;
              border-radius: 8px;
            }
            .dark .react-calendar__navigation button:enabled:hover,
            .dark .react-calendar__navigation button:enabled:focus {
              background: #27272a;
            }
            .react-calendar__month-view__weekdays__weekday {
              font-size: 0.75rem;
              font-weight: 600;
              color: #71717a;
              text-transform: uppercase;
              text-decoration: none;
              padding: 0.5rem 0;
            }
            .dark .react-calendar__month-view__weekdays__weekday {
              color: #a1a1aa;
            }
            .react-calendar__month-view__weekdays__weekday abbr {
              text-decoration: none;
            }
            .react-calendar__tile {
              padding: 0.6rem 0.25rem;
              font-size: 0.85rem;
              color: #18181b;
              border-radius: 8px;
              position: relative;
            }
            .dark .react-calendar__tile {
              color: #f4f4f5;
            }
            .react-calendar__tile:enabled:hover,
            .react-calendar__tile:enabled:focus {
              background: #e4e4e7;
            }
            .dark .react-calendar__tile:enabled:hover,
            .dark .react-calendar__tile:enabled:focus {
              background: #27272a;
            }
            .react-calendar__tile--active {
              background: #4f46e5 !important;
              color: white !important;
            }
            .react-calendar__tile--now {
              background: #fef3c7;
            }
            .dark .react-calendar__tile--now {
              background: #422006;
            }
            .react-calendar__tile--now:enabled:hover {
              background: #fde68a;
            }
            .dark .react-calendar__tile--now:enabled:hover {
              background: #713f12;
            }
            .has-task .react-calendar__tile {
              box-shadow: inset 0 -3px 0 #4f46e5;
            }
            .has-leave .react-calendar__tile {
              box-shadow: inset 0 -3px 0 #f59e0b;
            }
            .has-both .react-calendar__tile {
              box-shadow: inset 0 -3px 0 #4f46e5, inset 0 -6px 0 #f59e0b;
            }
            .react-calendar__month-view__days__day--weekend {
              color: #ef4444;
            }
            .dark .react-calendar__month-view__days__day--weekend {
              color: #f87171;
            }
            .react-calendar__tile--disabled {
              color: #d4d4d8 !important;
            }
            .dark .react-calendar__tile--disabled {
              color: #3f3f46 !important;
            }
          `}</style>
          <Calendar
            onChange={(value) => handleDateClick(value as Date, null)}
            value={date}
            onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setDate(activeStartDate)}
            tileContent={getTileContent}
            tileClassName={tileClassName}
          />
        </div>

        {/* Side Panel */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            {selectedEvents
              ? new Date(selectedEvents.date + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Click a date to see details"}
          </h2>

          {loading && (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
              <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
            </div>
          )}

          {!loading && selectedEvents && (
            <div className="space-y-4">
              {selectedEvents.tasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Tasks Due</h3>
                  <div className="space-y-2">
                    {selectedEvents.tasks.map((t, i) => (
                      <div key={i} className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.title}</p>
                        <p className="text-xs text-zinc-400">{t.project}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEvents.leaves.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Leave</h3>
                  <div className="space-y-2">
                    {selectedEvents.leaves.map((l, i) => (
                      <div key={i} className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                        <p className="text-sm text-zinc-900 dark:text-zinc-100">{l.reason}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                          l.status === "approved"
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                            : l.status === "rejected"
                            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                        }`}>
                          {l.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEvents.tasks.length === 0 && selectedEvents.leaves.length === 0 && (
                <p className="text-sm text-zinc-400">Nothing scheduled for this day</p>
              )}
            </div>
          )}

          {!loading && !selectedEvents && (
            <p className="text-sm text-zinc-400">Select any date to view tasks and leaves</p>
          )}
        </div>
      </div>
    </div>
  );
}