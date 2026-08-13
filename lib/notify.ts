import dbConnect from "./db";
import Notification, { NotificationType } from "@/models/Notification";

interface NotifyEntry {
  companyId: string;
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}

/**
 * Create a single notification for one user. Never throws — notification
 * failures should not break the flow that triggered them.
 */
export async function notifyUser({
  companyId,
  userId,
  title,
  message,
  type = "system",
  link,
}: NotifyEntry) {
  try {
    await dbConnect();
    await Notification.create({
      companyId,
      userId,
      title,
      message,
      type,
      isRead: false,
      link,
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

/** Create the same notification for many users (e.g. every approver). */
export async function notifyUsers(entries: NotifyEntry[]) {
  try {
    await dbConnect();
    const docs = entries.map((e) => ({
      companyId: e.companyId,
      userId: e.userId,
      title: e.title,
      message: e.message,
      type: e.type ?? "system",
      isRead: false,
      link: e.link,
    }));
    if (docs.length > 0) {
      await Notification.insertMany(docs);
    }
  } catch (error) {
    console.error("Failed to create notifications:", error);
  }
}
