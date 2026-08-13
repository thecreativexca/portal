import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Project from "@/models/Project";
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
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const project = await Project.findOne({ _id: objectId, companyId });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, any> = {};

    if (body.progress !== undefined) {
      const progress = Number(body.progress);
      if (isNaN(progress) || progress < 0 || progress > 100) {
        return NextResponse.json(
          { error: "Progress must be a number between 0 and 100" },
          { status: 400 }
        );
      }
      updateData.progress = progress;
    }

    if (body.actualHours !== undefined) {
      const hours = Number(body.actualHours);
      if (isNaN(hours) || hours < 0) {
        return NextResponse.json(
          { error: "Actual hours must be a non-negative number" },
          { status: 400 }
        );
      }
      updateData.actualHours = hours;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Provide progress and/or actualHours to update" },
        { status: 400 }
      );
    }

    const updated = await Project.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    }).lean();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "UPDATE_PROJECT_PROGRESS",
      details: `Updated progress for project "${project.projectName}"`,
    });

    return NextResponse.json({ project: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
