import dbConnect from "./db";
import Notification, { NotificationType } from "@/models/Notification";
import User from "@/models/User";
import Role from "@/models/Role";
import { ROLE_DEFINITIONS } from "@/lib/permissions";

export interface NotifyEntry {
  companyId: string;
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}

type NotifyPayload = Omit<NotifyEntry, "companyId" | "userId">;

/** Role keys that grant a permission (CEO always included). */
export async function roleKeysWithPermission(
  companyId: string,
  permission: string
): Promise<string[]> {
  await dbConnect();
  const roles = await Role.find({ companyId }).lean();
  const fromDb = roles
    .filter(
      (r) => r.key === "ceo" || (r.permissions || []).includes(permission)
    )
    .map((r) => r.key);

  if (fromDb.length > 0) return fromDb;

  // Fallback when role documents are missing from the DB.
  return ROLE_DEFINITIONS.filter(
    (r) => r.key === "ceo" || r.permissions.includes(permission)
  ).map((r) => r.key);
}

/** Active user ids whose role grants the given permission. */
export async function activeUserIdsWithPermission(
  companyId: string,
  permission: string,
  excludeUserId?: string
): Promise<string[]> {
  const keys = await roleKeysWithPermission(companyId, permission);
  const users = await User.find({
    companyId,
    role: { $in: keys as any },
    status: "active",
  })
    .select("_id")
    .lean();
  return users
    .map((u) => u._id.toString())
    .filter((id) => id !== excludeUserId);
}

/** Notify every active user who has a specific permission. */
export async function notifyPermission(
  companyId: string,
  permission: string,
  payload: NotifyPayload,
  excludeUserId?: string
) {
  let userIds = await activeUserIdsWithPermission(
    companyId,
    permission,
    excludeUserId
  );

  if (userIds.length === 0) {
    const ceos = await User.find({
      companyId,
      role: "ceo",
      status: "active",
    })
      .select("_id")
      .lean();
    userIds = ceos
      .map((u) => u._id.toString())
      .filter((id) => id !== excludeUserId);
  }

  if (userIds.length === 0 && excludeUserId) {
    await notifyUsers([{ companyId, userId: excludeUserId, ...payload }]);
    return;
  }

  await notifyUsers(
    userIds.map((userId) => ({ companyId, userId, ...payload }))
  );
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
