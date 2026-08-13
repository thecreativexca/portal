import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Attendance, { IAttendance } from "@/models/Attendance";
import { requireAuth, handleApiError } from "@/lib/guards";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("attendance.read");
    await dbConnect();

    const userId = user._id;
    const canViewAll = user.role === "ceo" || user.role === "hr";
    const { searchParams } = new URL(request.url);

    const queryUserId = searchParams.get("userId");
    const month = searchParams.get("month"); // format: YYYY-MM

    const query: mongoose.QueryFilter<IAttendance> = { companyId };

    // Users who can manage attendance see everyone (optionally filtered);
    // everyone else sees only their own records.
    if (!canViewAll) {
      query.userId = userId;
    } else if (queryUserId) {
      query.userId = queryUserId;
    }

    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 0, 23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const records = await Attendance.find(query)
      .populate("userId", "fullName name email role")
      .sort({ date: -1 })
      .lean();

    // Also return today's status for the current user
    let todayRecord = null;
    if (!queryUserId || queryUserId === userId.toString()) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      todayRecord = await Attendance.findOne({
        companyId,
        userId,
        date: today,
      }).lean();
    }

    return NextResponse.json({ records, todayRecord });
  } catch (error) {
    return handleApiError(error);
  }
}
