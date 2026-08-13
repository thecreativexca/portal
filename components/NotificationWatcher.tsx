"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { toastNotification } from "@/lib/client";
import type { NotificationData } from "@/lib/notifications";

/**
 * Polls for new unread notifications and shows a toast when something arrives.
 * Mounted once in Providers so alerts work on every page.
 */
export default function NotificationWatcher() {
  const { status } = useSession();
  const knownIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      knownIds.current.clear();
      initialized.current = false;
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch("/api/notifications?limit=15&isRead=false");
        if (!res.ok) return;
        const data = await res.json();
        const notifications: NotificationData[] = data.notifications || [];

        if (!initialized.current) {
          notifications.forEach((n) => knownIds.current.add(n._id));
          initialized.current = true;
          return;
        }

        for (const n of notifications) {
          if (!knownIds.current.has(n._id)) {
            knownIds.current.add(n._id);
            toastNotification(n.title, n.message);
          }
        }
      } catch {
        // Ignore polling errors — the bell still works.
      }
    };

    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [status]);

  return null;
}
