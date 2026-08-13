import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";
import TimeLog from "@/models/TimeLog";
import { requireAuth, assertPermission, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

async function canManageTask(user: any) {
  try {
    await assertPermission(user, "tasks.write");
    return true;
  } catch {
    return false;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id, logId } = await params;
    const objectId = toObjectId(id);
    const logObjectId = toObjectId(logId);
    if (!objectId || !logObjectId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const log = await TimeLog.findOne({
      _id: logObjectId,
      taskId: objectId,
      companyId,
    });
    if (!log) {
      return NextResponse.json({ error: "Time log not found" }, { status: 404 });
    }

    const isOwner = log.userId.toString() === user._id.toString();
    const canManage = await canManageTask(user);
    if (!isOwner && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, any> = {};

    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.billable !== undefined)
      updateData.billable = body.billable !== false;
    if (body.durationMinutes !== undefined) {
      updateData.durationMinutes = Number(body.durationMinutes);
    }

    if (body.startTime !== undefined) {
      updateData.startTime = new Date(body.startTime);
    }
    if (body.endTime !== undefined) {
      const end = body.endTime ? new Date(body.endTime) : null;
      updateData.endTime = end;
      const start = updateData.startTime
        ? updateData.startTime
        : new Date(log.startTime);
      if (end && !isNaN(end.getTime())) {
        const dur = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
        if (dur < 0) {
          return NextResponse.json(
            { error: "End time must be after start time" },
            { status: 400 }
          );
        }
        updateData.durationMinutes = Math.max(0, dur);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await TimeLog.findByIdAndUpdate(logObjectId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("userId", "fullName name email")
      .lean();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TIME_LOG_UPDATED",
      details: `Updated a time log on task "${task.title}"`,
      taskId: objectId.toString(),
    });

    return NextResponse.json({ log: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id, logId } = await params;
    const objectId = toObjectId(id);
    const logObjectId = toObjectId(logId);
    if (!objectId || !logObjectId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const log = await TimeLog.findOne({
      _id: logObjectId,
      taskId: objectId,
      companyId,
    });
    if (!log) {
      return NextResponse.json({ error: "Time log not found" }, { status: 404 });
    }

    const isOwner = log.userId.toString() === user._id.toString();
    const canManage = await canManageTask(user);
    if (!isOwner && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await TimeLog.findByIdAndDelete(logObjectId);

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TIME_LOG_DELETED",
      details: `Deleted a time log on task "${task.title}"`,
      taskId: objectId.toString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
