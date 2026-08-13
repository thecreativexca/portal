export interface NotificationData {
  _id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export function notificationTypeAccent(type: string): string {
  const map: Record<string, string> = {
    leave: "tile-amber",
    approval: "tile-blue",
    task: "tile-purple",
    document: "tile-cyan",
    expense: "tile-rose",
    invoice: "tile-green",
    payroll: "tile-purple",
    message: "tile-cyan",
    system: "tile-blue",
  };
  return map[type] || "tile-blue";
}
