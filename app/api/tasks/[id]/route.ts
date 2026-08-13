import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Task, { TASK_STATUSES, TASK_PRIORITIES } from "@/models/Task";
import User from "@/models/User";
import TimeLog from "@/models/TimeLog";
import { requireAuth, assertPermission, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { loggedMinutesForTask } from "@/lib/taskTime";
import { toObjectId, toObjectIdOrNull } from "@/lib/ids";

/** Load a task with the full attachment data (single-task view only). */
async function loadTask(taskId: mongoose.Types.ObjectId, companyId: string) {
  const task = await Task.findOne({ _id: taskId, companyId })
    .populate("assignedTo", "fullName name email role")
    .populate("assignedBy", "fullName name email")
    .populate("projectId", "projectName status")
    .populate("comments.userId", "fullName name email")
    .populate("dependencyTaskIds", "title status priority dueDate")
    .populate("attachments.uploadedBy", "fullName name email")
    .lean();
  if (!task) return null;
  return {
    ...task,
    loggedMinutes: await loggedMinutesForTask(task._id, companyId),
  };
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

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Employees may only open their own tasks.
    if (user.role === "employee" && task.assignedTo.toString() !== user._id.toString()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const populated = await loadTask(objectId, companyId);
    return NextResponse.json({ task: populated });
  } catch (error) {
    return handleApiError(error);
  }
}

async function updateTask(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    let canManage = false;
    try {
      await assertPermission(user, "tasks.write");
      canManage = true;
    } catch {
      canManage = false;
    }

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const body = await request.json();

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Only the assigned user or someone with task management can update.
    const isAssigned = task.assignedTo.toString() === user._id.toString();
    if (!isAssigned && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: Record<string, any> = {};

    // Assignee can update the status only.
    if (isAssigned && body.status) {
      if (!TASK_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${TASK_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }

    // Task managers can update everything.
    if (canManage) {
      if (body.title !== undefined) {
        if (!String(body.title).trim())
          return NextResponse.json({ error: "Title is required" }, { status: 400 });
        updateData.title = String(body.title).trim();
      }
      if (body.description !== undefined)
        updateData.description = body.description;
      if (body.status !== undefined) {
        if (!TASK_STATUSES.includes(body.status)) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${TASK_STATUSES.join(", ")}` },
            { status: 400 }
          );
        }
        updateData.status = body.status;
      }
      if (body.priority !== undefined) {
        if (!TASK_PRIORITIES.includes(body.priority)) {
          return NextResponse.json(
            { error: `Invalid priority. Must be one of: ${TASK_PRIORITIES.join(", ")}` },
            { status: 400 }
          );
        }
        updateData.priority = body.priority;
      }
      if (body.startDate !== undefined)
        updateData.startDate = body.startDate ? new Date(body.startDate) : null;
      if (body.dueDate !== undefined)
        updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.estimatedHours !== undefined)
        updateData.estimatedHours =
          body.estimatedHours === null || body.estimatedHours === ""
            ? null
            : Number(body.estimatedHours);
      if (body.billable !== undefined)
        updateData.billable = body.billable !== false;
      if (body.labels !== undefined) {
        updateData.labels = Array.isArray(body.labels)
          ? body.labels.map((l: string) => String(l).trim()).filter(Boolean)
          : [];
      }
      if (body.assignedTo !== undefined) {
        const assignee = await User.findOne({
          _id: body.assignedTo,
          companyId,
        }).lean();
        if (!assignee) {
          return NextResponse.json(
            { error: "Assignee not found in your company" },
            { status: 400 }
          );
        }
        updateData.assignedTo = body.assignedTo;
      }
      if (body.dependencyTaskIds !== undefined) {
        const depIds = Array.isArray(body.dependencyTaskIds)
          ? body.dependencyTaskIds.filter((d: any) => toObjectIdOrNull(String(d)))
          : [];
        if (depIds.length) {
          const deps = await Task.find({
            _id: { $in: depIds },
            companyId,
            projectId: task.projectId,
          }).lean();
          if (deps.length !== depIds.length) {
            return NextResponse.json(
              { error: "One or more dependencies are invalid for this project" },
              { status: 400 }
            );
          }
        }
        updateData.dependencyTaskIds = depIds;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    await Task.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    });

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TASK_UPDATED",
      details: `Updated task "${task.title}"`,
      taskId: objectId.toString(),
    });

    const populated = await loadTask(objectId, companyId);
    return NextResponse.json({ task: populated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateTask(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateTask(request, context);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("tasks.write");
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

    // Remove time logs before the task itself so the company never keeps
    // orphaned records.
    await TimeLog.deleteMany({ taskId: objectId });
    await Task.findByIdAndDelete(objectId);

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TASK_DELETED",
      details: `Deleted task "${task.title}"`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
