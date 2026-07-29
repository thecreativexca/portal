import dbConnect from "./db";
import ActivityLog from "@/models/ActivityLog";

interface LogEntry {
  userId: string;
  action: string;
  details: string;
}

export async function logActivity({ userId, action, details }: LogEntry) {
  try {
    await dbConnect();
    await ActivityLog.create({
      userId,
      action,
      details,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
    // Don't throw — logging should never break the main flow
  }
}