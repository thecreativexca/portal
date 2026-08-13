import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Project from "@/models/Project";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

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
    const memberId = body.memberId;
    if (!memberId || !toObjectId(memberId)) {
      return NextResponse.json(
        { error: "A valid member id is required" },
        { status: 400 }
      );
    }

    // The member must belong to the same company.
    const member = await User.findOne({
      _id: memberId,
      companyId,
      status: "active",
    }).lean();
    if (!member) {
      return NextResponse.json(
        { error: "Team member not found in your company" },
        { status: 400 }
      );
    }

    const memberObjectId = toObjectId(memberId);
    const alreadyMember = (project.teamMemberIds || []).some(
      (m: any) => m.toString() === memberObjectId!.toString()
    );

    if (!alreadyMember) {
      project.teamMemberIds.push(memberObjectId!);
      await project.save();
    }

    const populated = await Project.findById(objectId)
      .populate("teamMemberIds", "fullName name email role")
      .lean();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "ADD_TEAM_MEMBER",
      details: `Added ${member.fullName || member.name} to project "${project.projectName}"`,
    });

    return NextResponse.json({ project: populated });
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
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const project = await Project.findOne({ _id: objectId, companyId });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("memberId");
    const memberObjectId = memberId ? toObjectId(memberId) : null;
    if (!memberObjectId) {
      return NextResponse.json(
        { error: "A valid memberId query parameter is required" },
        { status: 400 }
      );
    }

    project.teamMemberIds = (project.teamMemberIds || []).filter(
      (m: any) => m.toString() !== memberObjectId.toString()
    );
    await project.save();

    const populated = await Project.findById(objectId)
      .populate("teamMemberIds", "fullName name email role")
      .lean();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "REMOVE_TEAM_MEMBER",
      details: `Removed a team member from project "${project.projectName}"`,
    });

    return NextResponse.json({ project: populated });
  } catch (error) {
    return handleApiError(error);
  }
}
