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
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id, attachmentId } = await params;
    const objectId = toObjectId(id);
    const attachmentObjectId = toObjectId(attachmentId);
    if (!objectId || !attachmentObjectId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const attachment = task.attachments.find(
      (a) => a._id.toString() === attachmentObjectId.toString()
    );
    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // The uploader or a task manager may delete an attachment.
    const isUploader =
      attachment.uploadedBy.toString() === user._id.toString();
    let canManage = false;
    try {
      await assertPermission(user, "tasks.write");
      canManage = true;
    } catch {
      canManage = false;
    }
    if (!isUploader && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    task.attachments = task.attachments.filter(
      (a) => a._id.toString() !== attachmentObjectId.toString()
    );
    await task.save();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TASK_ATTACHMENT_DELETED",
      details: `Removed "${attachment.name}" from task "${task.title}"`,
      taskId: objectId.toString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
