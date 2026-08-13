import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

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

    const body = await request.json();
    if (!body.text || !body.text.trim()) {
      return NextResponse.json(
        { error: "Comment text is required" },
        { status: 400 }
      );
    }

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Anyone who can see the task can comment on it (employees only on their
    // own tasks — enforced by the task GET scoping).
    task.comments.push({
      userId: user._id,
      text: body.text.trim(),
      timestamp: new Date(),
    });

    await task.save();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TASK_COMMENTED",
      details: `Commented on task "${task.title}"`,
      taskId: objectId.toString(),
    });

    const updated = await Task.findById(objectId)
      .select("-attachments.data")
      .populate("assignedTo", "fullName name email")
      .populate("assignedBy", "fullName name email")
      .populate("projectId", "projectName")
      .populate("comments.userId", "fullName name email")
      .populate("dependencyTaskIds", "title status")
      .populate("attachments.uploadedBy", "fullName name email")
      .lean();

    return NextResponse.json({ task: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
