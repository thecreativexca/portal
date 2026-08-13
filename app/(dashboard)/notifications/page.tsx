"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";
import NotificationTypeIcon from "@/components/NotificationTypeIcon";
import {
  type NotificationData,
  formatNotificationTime,
  notificationTypeAccent,
} from "@/lib/notifications";

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
    const target = notifications.find((x) => x._id === id);
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setNotifications((prev) => prev.filter((x) => x._id !== id));
      if (target && !target.isRead) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
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
                <div className={`tile tile-sm ${notificationTypeAccent(n.type)}`}>
                  <NotificationTypeIcon type={n.type} />
                </div>
                <div className="notif-body">
                  <div className="notif-title-row">
                    {!n.isRead && <span className="notif-unread-dot" aria-hidden />}
                    <p className="notif-title">{n.title}</p>
                  </div>
                  <p className="notif-msg">{n.message}</p>
                  <p className="notif-time">{formatNotificationTime(n.createdAt)}</p>
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
