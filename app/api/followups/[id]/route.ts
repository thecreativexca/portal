import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import FollowUp, {
  FOLLOWUP_TYPES,
  FOLLOWUP_STATUSES,
} from "@/models/FollowUp";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

const OWNER_POPULATE = "fullName name email";

const EDITABLE_FIELDS = ["title", "type", "dueAt", "status", "notes", "assignedToId"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("crm.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json(
        { error: "Invalid follow-up id" },
        { status: 400 }
      );
    }

    const followUp = await FollowUp.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    })
      .populate("leadId", "companyName contactName email")
      .populate("opportunityId", "opportunityName stage")
      .populate("assignedToId", OWNER_POPULATE)
      .lean();

    if (!followUp) {
      return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
    }

    return NextResponse.json({ followUp });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("crm.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json(
        { error: "Invalid follow-up id" },
        { status: 400 }
      );
    }

    const existing = await FollowUp.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!existing) {
      return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
    }

    const body = await request.json();

    if (
      body.type !== undefined &&
      !(FOLLOWUP_TYPES as readonly string[]).includes(body.type)
    ) {
      return NextResponse.json(
        { error: `Type must be one of: ${FOLLOWUP_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (
      body.status !== undefined &&
      !(FOLLOWUP_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json(
        { error: `Status must be one of: ${FOLLOWUP_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (body.assignedToId) {
      const assignee = await User.findOne({
        _id: body.assignedToId,
        companyId,
      }).lean();
      if (!assignee) {
        return NextResponse.json(
          { error: "Assignee not found in your company" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      if (field === "title" && !String(body[field]).trim()) {
        return NextResponse.json(
          { error: "Title is required" },
          { status: 400 }
        );
      }
      if (field === "dueAt") {
        updateData[field] = new Date(body[field]);
        continue;
      }
      if (field === "status") {
        updateData[field] = body[field];
        updateData.completedAt =
          body[field] === "completed" ? new Date() : null;
        continue;
      }
      if (field === "assignedToId" && !body[field]) {
        updateData[field] = null;
        continue;
      }
      updateData[field] = body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await FollowUp.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("leadId", "companyName contactName email")
      .populate("opportunityId", "opportunityName stage")
      .populate("assignedToId", OWNER_POPULATE)
      .lean();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_FOLLOWUP",
      details: `Updated follow-up "${updated!.title}"`,
    });

    return NextResponse.json({ followUp: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("crm.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json(
        { error: "Invalid follow-up id" },
        { status: 400 }
      );
    }

    const followUp = await FollowUp.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!followUp) {
      return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
    }

    followUp.deletedAt = new Date();
    await followUp.save();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_FOLLOWUP",
      details: `Deleted follow-up "${followUp.title}"`,
    });

    return NextResponse.json({ message: "Follow-up deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
