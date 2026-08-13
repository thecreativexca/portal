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

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const isAssigned = task.assignedTo.toString() === user._id.toString();
    const canManage = await canManageTask(user);
    if (!isAssigned && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action;

    if (action === "start") {
      // One running timer per user.
      const running = await TimeLog.findOne({
        companyId,
        userId: user._id,
        endTime: null,
      });
      if (running) {
        return NextResponse.json(
          {
            error: "You already have a running timer. Stop it before starting a new one.",
          },
          { status: 400 }
        );
      }

      const now = new Date();
      const log = await TimeLog.create({
        companyId,
        taskId: objectId,
        userId: user._id,
        startTime: now,
        endTime: null,
        billable: task.billable !== false,
      });

      await logActivity({
        userId: user._id.toString(),
        companyId,
        action: "TIMER_STARTED",
        details: `Started a timer on task "${task.title}"`,
        taskId: objectId.toString(),
      });

      const populated = await TimeLog.findById(log._id)
        .populate("taskId", "title")
        .lean();

      return NextResponse.json({ timer: populated }, { status: 201 });
    }

    if (action === "stop") {
      const running = await TimeLog.findOne({
        companyId,
        userId: user._id,
        endTime: null,
      });
      if (!running) {
        return NextResponse.json(
          { error: "No running timer for this user" },
          { status: 400 }
        );
      }
      if (running.taskId.toString() !== objectId.toString()) {
        return NextResponse.json(
          { error: "Your running timer belongs to a different task" },
          { status: 400 }
        );
      }

      const now = new Date();
      running.endTime = now;
      running.durationMinutes = Math.max(
        0,
        Math.round((now.getTime() - new Date(running.startTime).getTime()) / (1000 * 60))
      );
      if (body.notes !== undefined) running.notes = body.notes;
      await running.save();

      await logActivity({
        userId: user._id.toString(),
        companyId,
        action: "TIMER_STOPPED",
        details: `Stopped a timer on task "${task.title}" after ${running.durationMinutes} min`,
        taskId: objectId.toString(),
      });

      const populated = await TimeLog.findById(running._id)
        .populate("userId", "fullName name email")
        .populate("taskId", "title")
        .lean();

      return NextResponse.json({ timer: populated });
    }

    return NextResponse.json(
      { error: 'Action must be "start" or "stop"' },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
