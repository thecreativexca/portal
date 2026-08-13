import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import FollowUp, { FOLLOWUP_TYPES, FOLLOWUP_STATUSES } from "@/models/FollowUp";
import Lead from "@/models/Lead";
import Opportunity from "@/models/Opportunity";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId, toObjectIdOrNull } from "@/lib/ids";

const OWNER_POPULATE = "fullName name email";

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("crm.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query: Record<string, any> = { companyId, deletedAt: null };

    // Date range — used by the reminder calendar.
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from || to) {
      query.dueAt = {};
      if (from) query.dueAt.$gte = new Date(from);
      if (to) query.dueAt.$lte = new Date(to);
    }

    const status = searchParams.get("status");
    if (status && (FOLLOWUP_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }
    const leadId = searchParams.get("leadId");
    if (leadId && toObjectIdOrNull(leadId)) query.leadId = leadId;
    const opportunityId = searchParams.get("opportunityId");
    if (opportunityId && toObjectIdOrNull(opportunityId))
      query.opportunityId = opportunityId;
    const assignedTo = searchParams.get("assignedTo");
    if (assignedTo && toObjectIdOrNull(assignedTo))
      query.assignedToId = assignedTo;

    const search = searchParams.get("search");
    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [{ title: regex }, { notes: regex }];
    }

    const followUps = await FollowUp.find(query)
      .populate("leadId", "companyName contactName email")
      .populate("opportunityId", "opportunityName stage")
      .populate("assignedToId", OWNER_POPULATE)
      .sort({ dueAt: 1 })
      .lean();

    return NextResponse.json({ followUps });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("crm.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const { leadId, opportunityId, title, type, dueAt, status, notes, assignedToId } =
      body;

    if (!title || !String(title).trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }
    if (!dueAt) {
      return NextResponse.json(
        { error: "Due date is required" },
        { status: 400 }
      );
    }
    if (
      type &&
      !(FOLLOWUP_TYPES as readonly string[]).includes(type)
    ) {
      return NextResponse.json(
        { error: `Type must be one of: ${FOLLOWUP_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (
      status &&
      !(FOLLOWUP_STATUSES as readonly string[]).includes(status)
    ) {
      return NextResponse.json(
        { error: `Status must be one of: ${FOLLOWUP_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Referenced records must belong to the same company.
    if (leadId) {
      const lead = await Lead.findOne({
        _id: leadId,
        companyId,
        deletedAt: null,
      }).lean();
      if (!lead) {
        return NextResponse.json(
          { error: "Lead not found in your company" },
          { status: 400 }
        );
      }
    }
    if (opportunityId) {
      const opp = await Opportunity.findOne({
        _id: opportunityId,
        companyId,
        deletedAt: null,
      });
      if (!opp) {
        return NextResponse.json(
          { error: "Opportunity not found in your company" },
          { status: 400 }
        );
      }
    }
    if (assignedToId) {
      const assignee = await User.findOne({
        _id: assignedToId,
        companyId,
      }).lean();
      if (!assignee) {
        return NextResponse.json(
          { error: "Assignee not found in your company" },
          { status: 400 }
        );
      }
    }

    const followUp = await FollowUp.create({
      companyId,
      leadId,
      opportunityId,
      title: String(title).trim(),
      type: type || "call",
      dueAt: new Date(dueAt),
      status: status || "pending",
      notes,
      assignedToId: assignedToId || actor._id,
      createdBy: actor._id,
      completedAt:
        status === "completed" ? new Date() : null,
    });

    // Stamp a "follow-up scheduled" event on the linked opportunity timeline.
    if (opportunityId) {
      await Opportunity.updateOne(
        { _id: opportunityId, companyId, deletedAt: null },
        {
          $push: {
            timeline: {
              type: "followup",
              title: `Follow-up scheduled: ${followUp.title}`,
              description: `Due ${new Date(dueAt).toISOString().slice(0, 10)}`,
              userId: actor._id,
              at: new Date(),
            },
          },
        }
      );
    }

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_FOLLOWUP",
      details: `Scheduled follow-up "${followUp.title}"`,
    });

    const populated = await FollowUp.findById(followUp._id)
      .populate("leadId", "companyName contactName email")
      .populate("opportunityId", "opportunityName stage")
      .populate("assignedToId", OWNER_POPULATE)
      .lean();

    return NextResponse.json({ followUp: populated }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
