import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Lead, { LEAD_STAGES } from "@/models/Lead";
import Opportunity from "@/models/Opportunity";
import FollowUp from "@/models/FollowUp";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { moveLeadStage } from "@/lib/leadStage";
import { toObjectId } from "@/lib/ids";

const OWNER_POPULATE = "fullName name email";

/** Editable lead fields (whitelist for PATCH). Stage is handled via moveLeadStage. */
const EDITABLE_FIELDS = [
  "companyName",
  "contactName",
  "email",
  "phone",
  "source",
  "estimatedValue",
  "ownerId",
  "notes",
] as const;

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
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const lead = await Lead.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    })
      .populate("ownerId", OWNER_POPULATE)
      .populate("createdBy", "fullName name email")
      .lean();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [followUps, opportunity] = await Promise.all([
      FollowUp.find({ companyId, leadId: objectId, deletedAt: null })
        .populate("assignedToId", OWNER_POPULATE)
        .sort({ dueAt: 1 })
        .lean(),
      Opportunity.findOne({ companyId, leadId: objectId, deletedAt: null })
        .populate("ownerId", OWNER_POPULATE)
        .lean(),
    ]);

    return NextResponse.json({ lead, followUps, opportunity });
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
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const existing = await Lead.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = await request.json();

    if (
      body.stage !== undefined &&
      !(LEAD_STAGES as readonly string[]).includes(body.stage)
    ) {
      return NextResponse.json(
        { error: `Stage must be one of: ${LEAD_STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    if (body.ownerId) {
      const owner = await User.findOne({
        _id: body.ownerId,
        companyId,
      }).lean();
      if (!owner) {
        return NextResponse.json(
          { error: "Owner not found in your company" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      if (field === "companyName" && !String(body[field]).trim()) {
        return NextResponse.json(
          { error: "Company name is required" },
          { status: 400 }
        );
      }
      if (field === "estimatedValue") {
        updateData[field] =
          body[field] === "" || body[field] === null
            ? null
            : Number(body[field]);
        continue;
      }
      if (field === "ownerId" && !body[field]) {
        updateData[field] = null;
        continue;
      }
      updateData[field] = body[field];
    }

    // Stage changes route through the shared stage logic so the opportunity
    // and audit trail stay in sync.
    if (body.stage !== undefined && body.stage !== existing.stage) {
      await moveLeadStage({
        actor,
        companyId,
        leadId: id,
        toStage: body.stage,
        note: body.stageNote,
      });
    }

    if (Object.keys(updateData).length > 0) {
      await Lead.findByIdAndUpdate(objectId, updateData, {
        new: true,
        runValidators: true,
      });
    }

    const updated = await Lead.findById(objectId)
      .populate("ownerId", OWNER_POPULATE)
      .populate("createdBy", "fullName name email")
      .lean();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_LEAD",
      details: `Updated lead "${updated!.companyName}"`,
    });

    return NextResponse.json({ lead: updated });
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
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const lead = await Lead.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Soft delete: keep the record for the audit trail.
    lead.deletedAt = new Date();
    await lead.save();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_LEAD",
      details: `Deleted lead "${lead.companyName}"`,
    });

    return NextResponse.json({ message: "Lead deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
