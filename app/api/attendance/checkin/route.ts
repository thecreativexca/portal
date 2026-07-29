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

    // Check if already checked in today
    const existing = await Attendance.findOne({
      userId,
      date: today,
    });

    if (existing) {
      return NextResponse.json(
        { error: "Already checked in today" },
        { status: 400 }
      );
    }

    const now = new Date();
    const attendance = await Attendance.create({
      userId,
      date: today,
      checkInTime: now,
      status: "present",
    });

    await logActivity({
      userId,
      action: "CHECK_IN",
      details: `Checked in at ${now.toLocaleTimeString()}`,
    });

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    console.error("Error checking in:", error);
    return NextResponse.json(
      { error: "Failed to check in" },
      { status: 500 }
    );
  }
}