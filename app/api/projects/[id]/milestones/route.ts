import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Project from "@/models/Project";
import Milestone from "@/models/Milestone";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("projects.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const project = await Project.findOne({ _id: objectId, companyId }).lean();
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const milestones = await Milestone.find({ companyId, projectId: objectId })
      .sort({ dueDate: 1, createdAt: 1 })
      .lean();

    return NextResponse.json({ milestones });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
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
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const project = await Project.findOne({ _id: objectId, companyId });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, dueDate, status } = body;

    if (!title || !String(title).trim()) {
      return NextResponse.json(
        { error: "Milestone title is required" },
        { status: 400 }
      );
    }
    if (status && !["pending", "in-progress", "completed"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be pending, in-progress, or completed" },
        { status: 400 }
      );
    }

    const isCompleted = status === "completed";
    const milestone = await Milestone.create({
      companyId,
      projectId: objectId,
      title: String(title).trim(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      status: status || "pending",
      completedAt: isCompleted ? new Date() : undefined,
    });

    // Keep the project's denormalized milestone list in sync.
    project.milestoneIds.push(milestone._id as mongoose.Types.ObjectId);
    await project.save();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "CREATE_MILESTONE",
      details: `Created milestone "${milestone.title}"`,
    });

    return NextResponse.json({ milestone }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
