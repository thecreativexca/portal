import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Task, { MAX_ATTACHMENT_BYTES } from "@/models/Task";
import { requireAuth, assertPermission, handleApiError } from "@/lib/guards";
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
    const { name, mimeType, size, data } = body;

    if (!name || !data) {
      return NextResponse.json(
        { error: "File name and data are required" },
        { status: 400 }
      );
    }
    if (typeof size === "number" && size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "File is too large (max 5 MB)" },
        { status: 400 }
      );
    }
    // Guard against a client that omits size: estimate from base64 length.
    const approxBytes = Math.floor(data.length * 0.75);
    if (approxBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "File is too large (max 5 MB)" },
        { status: 400 }
      );
    }

    const task = await Task.findOne({ _id: objectId, companyId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Assignee or a task manager may attach files.
    const isAssigned = task.assignedTo.toString() === user._id.toString();
    let canManage = false;
    try {
      await assertPermission(user, "tasks.write");
      canManage = true;
    } catch {
      canManage = false;
    }
    if (!isAssigned && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    task.attachments.push({
      _id: new mongoose.Types.ObjectId(),
      name: String(name).slice(0, 255),
      mimeType: mimeType || "",
      size: typeof size === "number" ? size : approxBytes,
      data,
      uploadedBy: user._id,
      uploadedAt: new Date(),
    });

    await task.save();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TASK_ATTACHMENT",
      details: `Attached "${name}" to task "${task.title}"`,
      taskId: objectId.toString(),
    });

    const attachment = task.attachments[task.attachments.length - 1];

    // Return the attachment metadata (never the payload again).
    const populated = await Task.findById(objectId)
      .select("-attachments.data")
      .populate("assignedTo", "fullName name email")
      .populate("assignedBy", "fullName name email")
      .populate("projectId", "projectName")
      .populate("comments.userId", "fullName name email")
      .populate("dependencyTaskIds", "title status")
      .populate("attachments.uploadedBy", "fullName name email")
      .lean();

    return NextResponse.json({ attachment, task: populated }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
