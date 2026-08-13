import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import TimeLog from "@/models/TimeLog";
import { requireAuth, assertPermission, handleApiError } from "@/lib/guards";

/**
 * Personal / team time history.
 * Employees get their own logs; managers may pass ?userId= to view a member's.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth();
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const requestedUserId = searchParams.get("userId");

    let canViewOthers = false;
    try {
      await assertPermission(user, "tasks.write");
      canViewOthers = true;
    } catch {
      canViewOthers = false;
    }

    let userId = user._id;
    if (requestedUserId && canViewOthers) {
      userId = requestedUserId as any;
    }

    const query: Record<string, any> = { companyId, userId };

    if (from && to) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query.startTime = { $gte: fromDate, $lte: toDate };
    }

    const logs = await TimeLog.find(query)
      .populate("userId", "fullName name email")
      .populate("taskId", "title status dueDate")
      .sort({ startTime: -1 })
      .limit(500)
      .lean();

    const totalMinutes = logs.reduce(
      (s, l: any) => s + (l.endTime ? l.durationMinutes || 0 : 0),
      0
    );

    return NextResponse.json({ logs, totalMinutes });
  } catch (error) {
    return handleApiError(error);
  }
}
