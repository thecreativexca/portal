import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Project from "@/models/Project";
import Milestone from "@/models/Milestone";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("projects.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid milestone id" }, { status: 400 });
    }

    const milestone = await Milestone.findOne({ _id: objectId, companyId });
    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, dueDate, status } = body;

    if (title !== undefined && !String(title).trim()) {
      return NextResponse.json(
        { error: "Milestone title is required" },
        { status: 400 }
      );
    }
    if (
      status !== undefined &&
      !["pending", "in-progress", "completed"].includes(status)
    ) {
      return NextResponse.json(
        { error: "Status must be pending, in-progress, or completed" },
        { status: 400 }
      );
    }

    if (title !== undefined) milestone.title = String(title).trim();
    if (dueDate !== undefined) {
      milestone.dueDate = dueDate ? new Date(dueDate) : null;
    }
    if (status !== undefined) {
      milestone.status = status;
      // completedAt is kept in sync with the status.
      if (status === "completed") milestone.completedAt = new Date();
      else milestone.completedAt = null;
    }

    await milestone.save();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "UPDATE_MILESTONE",
      details: `Updated milestone "${milestone.title}"`,
    });

    return NextResponse.json({ milestone: milestone.toObject() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("projects.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid milestone id" }, { status: 400 });
    }

    const milestone = await Milestone.findOne({ _id: objectId, companyId });
    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    // Remove from the project's denormalized milestone list too.
    await Project.updateOne(
      { _id: milestone.projectId, companyId },
      { $pull: { milestoneIds: objectId } }
    );
    await Milestone.findByIdAndDelete(objectId);

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "DELETE_MILESTONE",
      details: `Deleted milestone "${milestone.title}"`,
    });

    return NextResponse.json({ message: "Milestone deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
