import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Attendance from "@/models/Attendance";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("reports.read");

    // Company-wide attendance is only visible to roles that manage attendance.
    if (user.role !== "ceo" && user.role !== "hr") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to dates required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const totalEmployees = await User.countDocuments({ companyId });
    const records = await Attendance.find({
      companyId,
      date: { $gte: fromDate, $lte: toDate },
    })
      .populate("userId", "fullName name email role")
      .sort({ date: 1 })
      .lean();

    // Aggregate by day
    const dayMap = new Map<
      string,
      { present: number; halfDay: number; absent: number; total: number }
    >();
    const today = new Date(fromDate);
    while (today <= toDate) {
      const key = today.toISOString().split("T")[0];
      dayMap.set(key, { present: 0, halfDay: 0, absent: 0, total: 0 });
      today.setDate(today.getDate() + 1);
    }

    records.forEach((r: any) => {
      const key = new Date(r.date).toISOString().split("T")[0];
      if (dayMap.has(key)) {
        const entry = dayMap.get(key)!;
        entry.total++;
        if (r.status === "present") entry.present++;
        else if (r.status === "half-day") entry.halfDay++;
        else entry.absent++;
      }
    });

    const daily = Array.from(dayMap.entries())
      .map(([date, stats]) => ({
        date,
        ...stats,
        absent: Math.max(0, totalEmployees - stats.present - stats.halfDay),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Summary
    const totalPresent = daily.reduce((s, d) => s + d.present, 0);
    const totalHalfDay = daily.reduce((s, d) => s + d.halfDay, 0);
    const totalDays = daily.length;

    return NextResponse.json({
      daily,
      summary: {
        totalDays,
        totalPresent,
        totalHalfDay,
        averagePresent: totalDays
          ? Math.round((totalPresent / totalDays) * 10) / 10
          : 0,
        totalEmployees,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
