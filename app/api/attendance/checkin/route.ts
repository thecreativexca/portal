import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Attendance from "@/models/Attendance";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";

export async function POST(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const userId = user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existing = await Attendance.findOne({
      companyId,
      userId,
      date: today,
    });

    if (existing) {
      return NextResponse.json(
        { error: "Already checked in today" },
        { status: 400 }
      );
    }

    // Optional location string reported by the client.
    let location: string | undefined;
    try {
      const body = await request.json();
      location = typeof body.location === "string" ? body.location.trim() || undefined : undefined;
    } catch {
      // No request body — location is optional.
    }

    const now = new Date();
    const attendance = await Attendance.create({
      companyId,
      userId,
      date: today,
      checkIn: now,
      location,
      status: "present",
    });

    await logActivity({
      userId: userId.toString(),
      companyId,
      action: "CHECK_IN",
      details: `Checked in at ${now.toLocaleTimeString()}${location ? ` (${location})` : ""}`,
    });

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
