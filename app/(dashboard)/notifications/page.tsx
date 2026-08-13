"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

interface NotificationData {
  _id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();

  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (tab === "unread") params.set("isRead", "false");
      params.set("page", String(page));
      params.set("limit", "25");

      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    if (status === "authenticated") fetchNotifications();
  }, [fetchNotifications, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    pollingRef.current = setInterval(fetchNotifications, 15000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchNotifications, status]);

  const markRead = async (n: NotificationData) => {
    if (n.isRead) return;
    try {
      const res = await fetch(`/api/notifications/${n._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      if (!res.ok) return;
      setNotifications((prev) => prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Error marking read:", err);
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) return;
      setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setNotifications((prev) => prev.filter((x) => x._id !== id));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  if (status === "loading") return <LoadingCenter />;

  return (
    <PageShell>
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "You're all caught up"
        }
        badge={unreadCount > 0 ? <span className="count-chip">{unreadCount} new</span> : undefined}
        actions={
          <button onClick={markAllRead} disabled={unreadCount === 0} className="btn btn-primary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Mark all read
          </button>
        }
      />

      <div className="tab-bar">
        <button onClick={() => { setTab("all"); setPage(1); }} className={`tab-btn${tab === "all" ? " active" : ""}`}>
          All
        </button>
        <button onClick={() => { setTab("unread"); setPage(1); }} className={`tab-btn${tab === "unread" ? " active" : ""}`}>
          Unread
          {unreadCount > 0 && (
            <span className="badge badge-blue" style={{ fontSize: 10, padding: "1px 6px" }}>{unreadCount}</span>
          )}
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-center" style={{ padding: "48px 20px" }}>
            <div className="spinner" /><span>Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px 20px" }}>
            <div className="icon">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: "var(--fg)" }}>
              {tab === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p>We'll notify you when something needs your attention.</p>
          </div>
        ) : (
          <ul className="notif-list">
            {notifications.map((n) => (
              <li key={n._id} className={`notif-item${!n.isRead ? " unread" : ""}`}>
                <div className={`tile tile-sm ${typeAccentClass(n.type) || "tile-blue"}`}>
                  {typeIcon(n.type)}
                </div>
                <div className="notif-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!n.isRead && (
                      <span style={{ height: 8, width: 8, borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />
                    )}
                    <p className="notif-title">{n.title}</p>
                  </div>
                  <p className="notif-msg">{n.message}</p>
                  <p className="notif-time">{formatTime(n.createdAt)}</p>
                </div>
                <div className="notif-actions">
                  {n.link && (
                    <a href={n.link} onClick={() => markRead(n)} className="btn btn-secondary btn-sm">Open</a>
                  )}
                  {!n.isRead && (
                    <button onClick={() => markRead(n)} className="btn btn-ghost btn-sm">Read</button>
                  )}
                  <button onClick={() => remove(n._id)} className="icon-btn" title="Delete" style={{ color: "var(--fg-subtle)" }}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function typeAccentClass(type: string): string {
  const map: Record<string, string> = {
    leave: "tile-amber",
    approval: "tile-blue",
    task: "tile-purple",
    document: "tile-cyan",
    expense: "tile-rose",
    invoice: "tile-green",
    payroll: "tile-purple",
    message: "tile-cyan",
    system: "",
  };
  return map[type] || "";
}

function typeIcon(type: string) {
  const cls = "w-5 h-5";
  const common = { fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor" } as const;
  switch (type) {
    case "leave":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75" /></svg>;
    case "approval":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case "task":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
    case "document":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
    case "expense":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>;
    case "invoice":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
    case "payroll":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>;
    case "message":
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.016 2.016 0 01-.598-.494" /></svg>;
    default:
      return <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>;
  }
}
