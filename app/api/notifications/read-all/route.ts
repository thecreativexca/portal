import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Notification from "@/models/Notification";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";

/** Mark every unread notification for the current user as read. */
export async function POST(_request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("notifications.read");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { modifiedCount } = await Notification.updateMany(
      { companyId, userId: user._id, isRead: false },
      { isRead: true }
    );

    if (modifiedCount > 0) {
      await logActivity({
        userId: user._id.toString(),
        companyId,
        action: "NOTIFICATIONS_READ_ALL",
        details: `Marked ${modifiedCount} notifications as read`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
