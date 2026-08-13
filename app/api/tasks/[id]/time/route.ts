import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";
import User from "@/models/User";
import TimeLog from "@/models/TimeLog";
import { requireAuth, assertPermission, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

async function loadTask(objectId: mongoose.Types.ObjectId, companyId: string) {
  return Task.findOne({ _id: objectId, companyId });
}

/** Can this user manage (write) tasks, beyond just the assignee? */
async function canManageTask(user: any) {
  try {
    await assertPermission(user, "tasks.write");
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("tasks.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const task = await loadTask(objectId, companyId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (
      user.role === "employee" &&
      task.assignedTo.toString() !== user._id.toString()
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const logs = await TimeLog.find({ taskId: objectId, companyId })
      .populate("userId", "fullName name email")
      .sort({ startTime: -1 })
      .lean();

    return NextResponse.json({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const task = await loadTask(objectId, companyId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const isAssigned = task.assignedTo.toString() === user._id.toString();
    const canManage = await canManageTask(user);
    if (!isAssigned && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const startTime = body.startTime ? new Date(body.startTime) : null;
    const endTime = body.endTime ? new Date(body.endTime) : null;

    if (!startTime || isNaN(startTime.getTime())) {
      return NextResponse.json(
        { error: "A valid start time is required" },
        { status: 400 }
      );
    }

    // Managers may log time on behalf of a team member.
    let userId = user._id;
    if (body.userId && canManage) {
      const target = await User.findOne({
        _id: body.userId,
        companyId,
      }).lean();
      if (!target) {
        return NextResponse.json(
          { error: "User not found in your company" },
          { status: 400 }
        );
      }
      userId = body.userId;
    }

    let durationMinutes = body.durationMinutes;
    if (endTime && !isNaN(endTime.getTime())) {
      const dur = Math.round(
        (endTime.getTime() - startTime.getTime()) / (1000 * 60)
      );
      if (durationMinutes === undefined || durationMinutes === null) {
        durationMinutes = Math.max(0, dur);
      }
      if (dur < 0) {
        return NextResponse.json(
          { error: "End time must be after start time" },
          { status: 400 }
        );
      }
    }

    const log = await TimeLog.create({
      companyId,
      taskId: objectId,
      userId,
      startTime,
      endTime: endTime && !isNaN(endTime.getTime()) ? endTime : null,
      durationMinutes:
        endTime && !isNaN(endTime.getTime())
          ? durationMinutes
          : undefined,
      notes: body.notes,
      billable: body.billable !== false,
    });

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TIME_LOG_CREATED",
      details: `Logged ${durationMinutes ?? 0} min on task "${task.title}"`,
      taskId: objectId.toString(),
    });

    const populated = await TimeLog.findById(log._id)
      .populate("userId", "fullName name email")
      .lean();

    return NextResponse.json({ log: populated }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
