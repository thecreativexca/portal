import dbConnect from "./db";
import ActivityLog from "@/models/ActivityLog";
import { notifyForActivity } from "./activityNotifications";

interface LogEntry {
  userId: string;
  companyId: string;
  action: string;
  details: string;
  /** Optional task link so the task drawer can show its own activity feed. */
  taskId?: string;
  /** Also notify specific users (e.g. a newly added project member). */
  notifyUserIds?: string[];
  /** Skip auto-notification when the caller handles it separately. */
  skipNotify?: boolean;
}

export async function logActivity({
  userId,
  companyId,
  action,
  details,
  taskId,
  notifyUserIds,
  skipNotify,
}: LogEntry) {
  try {
    await dbConnect();
    await ActivityLog.create({
      userId,
      companyId,
      action,
      details,
      timestamp: new Date(),
      taskId,
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
    // Don't throw — logging should never break the main flow
  }

  if (!skipNotify) {
    try {
      await notifyForActivity(action, companyId, userId, details, notifyUserIds);
    } catch (error) {
      console.error("Failed to dispatch activity notification:", error);
    }
  }
}
