import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Attendance from "@/models/Attendance";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const role = (session.user as any).role;
    const userId = (session.user as any).id;
    const { searchParams } = new URL(request.url);

    const queryUserId = searchParams.get("userId");
    const month = searchParams.get("month"); // format: YYYY-MM

    const query: Record<string, any> = {};

    // CEO can see everyone, employees see only themselves
    if (role !== "ceo") {
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
      .populate("userId", "name email role")
      .sort({ date: -1 })
      .lean();

    // Also return today's status for the current user
    let todayRecord = null;
    if (!queryUserId || queryUserId === userId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      todayRecord = await Attendance.findOne({
        userId,
        date: today,
      }).lean();
    }

    return NextResponse.json({ records, todayRecord });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return NextResponse.json(
      { error: "Failed to fetch attendance" },
      { status: 500 }
    );
  }
}