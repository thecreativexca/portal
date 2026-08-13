import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Opportunity, {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
} from "@/models/Opportunity";
import Lead, { LEAD_STAGES, LEAD_STAGE_LABELS } from "@/models/Lead";
import FollowUp from "@/models/FollowUp";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

const OWNER_POPULATE = "fullName name email";

/** Editable opportunity fields (whitelist for PATCH). */
const EDITABLE_FIELDS = [
  "opportunityName",
  "value",
  "expectedCloseDate",
  "probability",
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
      return NextResponse.json(
        { error: "Invalid opportunity id" },
        { status: 400 }
      );
    }

    const opportunity = await Opportunity.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    })
      .populate("ownerId", OWNER_POPULATE)
      .populate("leadId", "companyName contactName email stage")
      .populate("createdBy", "fullName name email")
      .lean();

    if (!opportunity) {
      return NextResponse.json(
        { error: "Opportunity not found" },
        { status: 404 }
      );
    }

    const followUps = await FollowUp.find({
      companyId,
      opportunityId: objectId,
      deletedAt: null,
    })
      .populate("assignedToId", OWNER_POPULATE)
      .sort({ dueAt: 1 })
      .lean();

    return NextResponse.json({ opportunity, followUps });
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
        { error: "Invalid opportunity id" },
        { status: 400 }
      );
    }

    const existing = await Opportunity.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Opportunity not found" },
        { status: 404 }
      );
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
    if (
      body.proposal?.status &&
      !(PROPOSAL_STATUSES as readonly string[]).includes(body.proposal.status)
    ) {
      return NextResponse.json(
        {
          error: `Proposal status must be one of: ${PROPOSAL_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    if (body.ownerId) {
      const owner = await User.findOne({ _id: body.ownerId, companyId }).lean();
      if (!owner) {
        return NextResponse.json(
          { error: "Owner not found in your company" },
          { status: 400 }
        );
      }
    }

    const now = new Date();
    const updateData: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      if (field === "opportunityName" && !String(body[field]).trim()) {
        return NextResponse.json(
          { error: "Opportunity name is required" },
          { status: 400 }
        );
      }
      if (field === "value") {
        updateData[field] =
          body[field] === "" || body[field] === null
            ? null
            : Number(body[field]);
        continue;
      }
      if (field === "expectedCloseDate") {
        updateData[field] = body[field] ? new Date(body[field]) : null;
        continue;
      }
      if (field === "probability") {
        updateData[field] =
          body[field] === "" || body[field] === null
            ? null
            : Math.min(100, Math.max(0, Number(body[field])));
        continue;
      }
      if (field === "ownerId" && !body[field]) {
        updateData[field] = null;
        continue;
      }
      updateData[field] = body[field];
    }

    // Timeline events (server-side, so every change is auditable).
    const newTimeline: typeof existing.timeline = [];

    // Stage change: keep the linked lead in lock-step and stamp the event.
    if (body.stage !== undefined && body.stage !== existing.stage) {
      updateData.stage = body.stage;
      if (body.stage === "won" || body.stage === "lost") {
        updateData.closedAt = existing.closedAt || now;
      } else {
        updateData.closedAt = null;
      }
      newTimeline.push({
        type:
          body.stage === "won"
            ? "won"
            : body.stage === "lost"
            ? "lost"
            : "stage_changed",
        title: `Moved to ${LEAD_STAGE_LABELS[body.stage as keyof typeof LEAD_STAGE_LABELS]}`,
        userId: actor._id,
        at: now,
      });

      if (existing.leadId) {
        const lead = await Lead.findOne({
          _id: existing.leadId,
          companyId,
          deletedAt: null,
        });
        if (lead && lead.stage !== body.stage) {
          lead.stage = body.stage;
          lead.stageChangedAt = now;
          if (body.stage === "won" || body.stage === "lost") {
            lead.closedAt = lead.closedAt || now;
          } else {
            lead.closedAt = null;
          }
          await lead.save();
        }
      }
    }

    // Proposal tracking changes.
    if (body.proposal) {
      const proposal = body.proposal;
      if (proposal.sentAt !== undefined) {
        updateData["proposal.sentAt"] = proposal.sentAt
          ? new Date(proposal.sentAt)
          : null;
      }
      if (proposal.dueAt !== undefined) {
        updateData["proposal.dueAt"] = proposal.dueAt
          ? new Date(proposal.dueAt)
          : null;
      }
      if (
        proposal.status !== undefined &&
        proposal.status !== existing.proposal?.status
      ) {
        updateData["proposal.status"] = proposal.status;
        if (proposal.status !== "draft") {
          newTimeline.push({
            type: "proposal",
            title: `Proposal ${PROPOSAL_STATUS_LABELS[proposal.status as keyof typeof PROPOSAL_STATUS_LABELS]}`,
            description: `Proposal marked as ${PROPOSAL_STATUS_LABELS[proposal.status as keyof typeof PROPOSAL_STATUS_LABELS]}`,
            userId: actor._id,
            at: now,
          });
        }
      }
    }

    if (newTimeline.length > 0) {
      updateData["$push"] = { timeline: { $each: newTimeline } };
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    await Opportunity.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_OPPORTUNITY",
      details: `Updated opportunity "${existing.opportunityName}"`,
    });

    const updated = await Opportunity.findById(objectId)
      .populate("ownerId", OWNER_POPULATE)
      .populate("leadId", "companyName contactName email stage")
      .lean();

    return NextResponse.json({ opportunity: updated });
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
        { error: "Invalid opportunity id" },
        { status: 400 }
      );
    }

    const opportunity = await Opportunity.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!opportunity) {
      return NextResponse.json(
        { error: "Opportunity not found" },
        { status: 404 }
      );
    }

    opportunity.deletedAt = new Date();
    await opportunity.save();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_OPPORTUNITY",
      details: `Deleted opportunity "${opportunity.opportunityName}"`,
    });

    return NextResponse.json({ message: "Opportunity deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
