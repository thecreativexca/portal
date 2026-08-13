import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Attendance, { IAttendance } from "@/models/Attendance";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

async function updateAttendance(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("attendance.manage");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid attendance id" }, { status: 400 });
    }

    const record = await Attendance.findOne({ _id: objectId, companyId });
    if (!record) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    const body = await request.json();

    const update: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!["present", "half-day", "absent"].includes(body.status)) {
        return NextResponse.json(
          { error: "Status must be present, half-day, or absent" },
          { status: 400 }
        );
      }
      update.status = body.status;
    }

    if (body.checkIn !== undefined) {
      const checkIn = new Date(body.checkIn);
      if (isNaN(checkIn.getTime())) {
        return NextResponse.json({ error: "Invalid checkIn time" }, { status: 400 });
      }
      update.checkIn = checkIn;
    }

    if (body.checkOut !== undefined && body.checkOut !== null) {
      const checkOut = new Date(body.checkOut);
      if (isNaN(checkOut.getTime())) {
        return NextResponse.json({ error: "Invalid checkOut time" }, { status: 400 });
      }
      update.checkOut = checkOut;
    } else if (body.checkOut === null) {
      update.checkOut = null;
    }

    if (body.totalHours !== undefined) {
      const total = Number(body.totalHours);
      if (isNaN(total) || total < 0) {
        return NextResponse.json(
          { error: "totalHours must be a non-negative number" },
          { status: 400 }
        );
      }
      update.totalHours = total;
    }

    if (body.overtimeHours !== undefined) {
      const overtime = Number(body.overtimeHours);
      if (isNaN(overtime) || overtime < 0) {
        return NextResponse.json(
          { error: "overtimeHours must be a non-negative number" },
          { status: 400 }
        );
      }
      update.overtimeHours = overtime;
    }

    if (body.location !== undefined) {
      update.location =
        typeof body.location === "string" ? body.location.trim() || null : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await Attendance.findByIdAndUpdate(objectId, update, {
      new: true,
      runValidators: true,
    }).lean();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_ATTENDANCE",
      details: `Updated attendance for ${new Date((record as IAttendance).date).toLocaleDateString()}`,
    });

    return NextResponse.json({ attendance: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateAttendance(request, context);
}

// Legacy alias kept so existing callers using PUT keep working.
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateAttendance(request, context);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("attendance.manage");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid attendance id" }, { status: 400 });
    }

    const record = await Attendance.findOneAndDelete({ _id: objectId, companyId });
    if (!record) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_ATTENDANCE",
      details: `Deleted attendance for ${new Date(record.date).toLocaleDateString()}`,
    });

    return NextResponse.json({ message: "Attendance record deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
