import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";
import { requireAuth, assertPermission, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id, commentId } = await params;
    const objectId = toObjectId(id);
    const commentObjectId = toObjectId(commentId);
    if (!objectId || !commentObjectId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comment = task.comments.find(
      (c) => c._id && c._id.toString() === commentObjectId.toString()
    );
    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    // The author or a task manager may delete a comment.
    let canManage = false;
    try {
      await assertPermission(user, "tasks.write");
      canManage = true;
    } catch {
      canManage = false;
    }

    const isAuthor = comment.userId.toString() === user._id.toString();
    if (!isAuthor && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    task.comments = task.comments.filter(
      (c) => !c._id || c._id.toString() !== commentObjectId.toString()
    );
    await task.save();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TASK_COMMENT_DELETED",
      details: `Deleted a comment on task "${task.title}"`,
      taskId: objectId.toString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
