import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Attendance from "@/models/Attendance";
import Settings from "@/models/Settings";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { standardHoursPerDay } from "@/lib/performance";
import { logActivity } from "@/lib/logActivity";

export async function POST() {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const userId = user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await Attendance.findOne({
      companyId,
      userId,
      date: today,
    });

    if (!record) {
      return NextResponse.json(
        { error: "No check-in record found for today" },
        { status: 400 }
      );
    }

    if (record.checkOut) {
      return NextResponse.json(
        { error: "Already checked out today" },
        { status: 400 }
      );
    }

    if (!record.checkIn) {
      return NextResponse.json(
        { error: "No check-in time recorded for today" },
        { status: 400 }
      );
    }

    const now = new Date();
    record.checkOut = now;

    // Total hours between check-in and check-out.
    const checkIn = new Date(record.checkIn).getTime();
    const hoursWorked = (now.getTime() - checkIn) / (1000 * 60 * 60);
    record.totalHours = Math.round(hoursWorked * 100) / 100;

    // If worked less than 4 hours, half-day.
    record.status = hoursWorked >= 4 ? "present" : "half-day";

    // Overtime is anything beyond the company's standard workday.
    const settings = await Settings.findOne({ companyId }).lean();
    const standardHours = standardHoursPerDay(
      settings?.workingHours as { start?: string; end?: string } | undefined
    );
    record.overtimeHours =
      standardHours > 0
        ? Math.round(Math.max(0, hoursWorked - standardHours) * 100) / 100
        : 0;

    await record.save();

    await logActivity({
      userId: userId.toString(),
      companyId,
      action: "CHECK_OUT",
      details: `Checked out at ${now.toLocaleTimeString()} (${record.status})`,
    });

    return NextResponse.json({ attendance: record });
  } catch (error) {
    return handleApiError(error);
  }
}
