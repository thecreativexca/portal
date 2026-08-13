"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import Link from "next/link";
import NotificationTypeIcon from "@/components/NotificationTypeIcon";
import {
  type NotificationData,
  formatNotificationTime,
  notificationTypeAccent,
} from "@/lib/notifications";

const DROPDOWN_WIDTH = 340;
const VIEWPORT_PAD = 12;

type DropdownPos =
  | { top: number; left: number; right: "auto"; width: number }
  | { top: number; left: "auto"; right: number; width: number };

function clampDropdownPosition(rect: DOMRect): DropdownPos {
  const vw = window.innerWidth;
  const isMobile = vw < 1024;
  const dropdownWidth = Math.min(DROPDOWN_WIDTH, vw - VIEWPORT_PAD * 2);
  const top = rect.bottom + 8;

  if (isMobile) {
    const right = Math.max(VIEWPORT_PAD, vw - rect.right);
    return { top, right, left: "auto" as const, width: dropdownWidth };
  }

  // Desktop sidebar: prefer opening into the main content (to the right of the bell).
  let left = rect.right + 8;
  if (left + dropdownWidth > vw - VIEWPORT_PAD) {
    left = rect.right - dropdownWidth;
  }
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - dropdownWidth - VIEWPORT_PAD));

  return { top, left, right: "auto" as const, width: dropdownWidth };
}

/**
 * Bell in the sidebar / mobile header. Polls every 10s and shows a portal
 * dropdown anchored to the bell so it never overlaps the sidebar on mobile.
 */
export default function NotificationBell() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<NotificationData[]>([]);
  const [unread, setUnread] = useState(0);
  const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0, right: "auto", width: DROPDOWN_WIDTH });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=5");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
      setUnread(data.unreadCount || 0);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }, []);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    setPos(clampDropdownPosition(btnRef.current.getBoundingClientRect()));
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchRecent();
    const id = setInterval(fetchRecent, 10000);
    return () => clearInterval(id);
  }, [fetchRecent, status]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onResize = () => updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (document.getElementById("notif-dropdown-portal")?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || window.innerWidth >= 1024) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const markRead = async (n: NotificationData) => {
    if (n.isRead) return;
    try {
      await fetch(`/api/notifications/${n._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Error marking read:", err);
    }
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnread(0);
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        requestAnimationFrame(updatePosition);
        fetchRecent();
      }
      return next;
    });
  };

  const dropdown = open && mounted ? (
  <>
    <div className="notif-backdrop" onClick={() => setOpen(false)} aria-hidden />
    <div
      id="notif-dropdown-portal"
      className="notif-dropdown notif-dropdown-fixed"
      style={{
        top: pos.top,
        left: pos.left === "auto" ? undefined : pos.left,
        right: pos.right === "auto" ? undefined : pos.right,
        width: pos.width,
      }}
      role="dialog"
      aria-label="Notifications"
    >
      <div className="notif-dropdown-head">
        <div className="notif-dropdown-title">
          <h3>Notifications</h3>
          {unread > 0 && <span className="count-chip">{unread} new</span>}
        </div>
        <div className="notif-dropdown-tools">
          {unread > 0 && (
            <button type="button" onClick={markAllRead} className="notif-mark-all">
              Mark all read
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="icon-btn" aria-label="Close">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="notif-empty">
          <div className="icon">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p>No notifications yet</p>
        </div>
      ) : (
        <ul className="notif-dropdown-list">
          {items.map((n) => (
            <li key={n._id}>
              <Link
                href={n.link || "/notifications"}
                onClick={() => { markRead(n); setOpen(false); }}
                className={`notif-dropdown-item${!n.isRead ? " unread" : ""}`}
              >
                <div className={`tile tile-sm ${notificationTypeAccent(n.type)}`}>
                  <NotificationTypeIcon type={n.type} className="w-4 h-4" />
                </div>
                <span className="notif-dropdown-body">
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-msg">{n.message}</span>
                  <span className="notif-time">{formatNotificationTime(n.createdAt)}</span>
                </span>
                {!n.isRead && <span className="notif-unread-dot" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/notifications" onClick={() => setOpen(false)} className="notif-dropdown-footer">
        View all notifications
      </Link>
    </div>
  </>
  ) : null;

  if (status === "loading") {
    return (
      <button type="button" className="notif-btn" aria-label="Loading notifications" disabled>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ opacity: 0.5 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      </button>
    );
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className="notif-btn"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
