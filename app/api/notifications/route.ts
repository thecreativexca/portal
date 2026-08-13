import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Notification, { NOTIFICATION_TYPES } from "@/models/Notification";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { notifyUser } from "@/lib/notify";
import { logActivity } from "@/lib/logActivity";
import { ok, parsePagination, paginationMeta } from "@/lib/api";
import { validate, reqString, enumValue } from "@/lib/validate";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("notifications.read");
    await dbConnect();

    const userId = user._id;
    const { searchParams } = new URL(request.url);
    const isRead = searchParams.get("isRead");
    const type = searchParams.get("type");
    const { page, pageSize, skip } = parsePagination(request.url, 30);

    const query: Record<string, any> = { companyId, userId };

    if (isRead === "true") query.isRead = true;
    if (isRead === "false") query.isRead = false;
    if (type && (NOTIFICATION_TYPES as readonly string[]).includes(type)) {
      query.type = type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ companyId, userId, isRead: false }),
    ]);

    return ok(
      { notifications, unreadCount },
      paginationMeta(total, page, pageSize)
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Create a notification for a user in the same company. Most notifications are
 * created server-side via lib/notify; this endpoint exists for tooling and
 * future "send reminder"-style actions.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const body = await request.json();
    const { userId, title, message, type, link } = body;

    const err = validate(body, {
      userId: reqString("userId"),
      title: reqString("Title"),
      message: reqString("Message"),
      type: enumValue(NOTIFICATION_TYPES, "type"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    // The recipient must belong to the same company.
    const recipient = await User.findOne({ _id: userId, companyId }).lean();
    if (!recipient) {
      return NextResponse.json(
        { error: "Recipient not found in your company" },
        { status: 400 }
      );
    }

    await notifyUser({
      companyId,
      userId,
      title,
      message,
      type: type || "system",
      link,
    });

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "NOTIFICATION_SENT",
      details: `Sent notification "${title}" to ${recipient.fullName || recipient.name || userId}`,
    });

    // Log who created it for the audit trail.
    const created = await Notification.findOne({
      companyId,
      userId,
      title,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ notification: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
