import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import ActivityLog from "@/models/ActivityLog";
import { requireAuth, handleApiError } from "@/lib/guards";
import { ok, parsePagination, paginationMeta } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("logs.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const { page, pageSize, skip } = parsePagination(request.url, 50);

    const query: Record<string, any> = { companyId };

    if (action) query.action = action;
    if (userId) query.userId = userId;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [logs, total, stats, todayLogs] = await Promise.all([
      ActivityLog.find(query)
        .populate("userId", "fullName name email role")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      ActivityLog.countDocuments(query),
      // Action distribution for the current filter.
      ActivityLog.aggregate([
        { $match: query },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Today's activity for the timeline summary card.
      ActivityLog.find({ companyId, timestamp: { $gte: todayStart } })
        .countDocuments(),
    ]);

    return ok(
      {
        logs,
        stats: {
          total,
          today: todayLogs,
          byAction: stats,
        },
      },
      paginationMeta(total, page, pageSize)
    );
  } catch (error) {
    return handleApiError(error);
  }
}
