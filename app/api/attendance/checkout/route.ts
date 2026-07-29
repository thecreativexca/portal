import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Attendance from "@/models/Attendance";
import { logActivity } from "@/lib/logActivity";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = (session.user as any).id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await Attendance.findOne({
      userId,
      date: today,
    });

    if (!record) {
      return NextResponse.json(
        { error: "No check-in record found for today" },
        { status: 400 }
      );
    }

    if (record.checkOutTime) {
      return NextResponse.json(
        { error: "Already checked out today" },
        { status: 400 }
      );
    }

    const now = new Date();
    record.checkOutTime = now;

    // Calculate status: if worked less than 4 hours, half-day
    const checkIn = new Date(record.checkInTime!).getTime();
    const checkOut = now.getTime();
    const hoursWorked = (checkOut - checkIn) / (1000 * 60 * 60);

    record.status = hoursWorked >= 4 ? "present" : "half-day";
    await record.save();

    await logActivity({
      userId,
      action: "CHECK_OUT",
      details: `Checked out at ${now.toLocaleTimeString()} (${record.status})`,
    });

    return NextResponse.json({ attendance: record });
  } catch (error) {
    console.error("Error checking out:", error);
    return NextResponse.json(
      { error: "Failed to check out" },
      { status: 500 }
    );
  }
}