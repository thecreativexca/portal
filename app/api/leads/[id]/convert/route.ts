import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Lead from "@/models/Lead";
import Opportunity from "@/models/Opportunity";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

/**
 * Convert a lead into an Opportunity. Creates the opportunity record, seeds its
 * timeline with a "created" event, and marks the lead as converted. The deal
 * then moves through the pipeline along with the lead (stage moves stay in sync
 * via lib/leadStage.ts).
 */
export async function POST(
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

    const existing = await Opportunity.findOne({
      companyId,
      leadId: objectId,
      deletedAt: null,
    });
    if (existing) {
      return NextResponse.json(
        { error: "This lead is already converted to an opportunity" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const now = new Date();

    const opportunity = await Opportunity.create({
      companyId,
      leadId: objectId,
      opportunityName:
        body.opportunityName && String(body.opportunityName).trim()
          ? String(body.opportunityName).trim()
          : lead.companyName,
      value:
        body.value !== undefined && body.value !== null && body.value !== ""
          ? Number(body.value)
          : lead.estimatedValue,
      expectedCloseDate: body.expectedCloseDate
        ? new Date(body.expectedCloseDate)
        : undefined,
      probability:
        body.probability !== undefined && body.probability !== null
          ? Math.min(100, Math.max(0, Number(body.probability)))
          : lead.stage === "proposal"
          ? 50
          : lead.stage === "negotiation"
          ? 75
          : 20,
      stage: lead.stage === "lead" ? "qualified" : lead.stage,
      ownerId: lead.ownerId,
      notes: lead.notes,
      createdBy: actor._id,
      timeline: [
        {
          type: "created",
          title: "Opportunity created",
          description: `Created from lead "${lead.companyName}"`,
          userId: actor._id,
          at: now,
        },
      ],
    });

    lead.convertedAt = now;
    await lead.save();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CONVERT_LEAD",
      details: `Converted lead "${lead.companyName}" to an opportunity`,
    });

    const populated = await Opportunity.findById(opportunity._id)
      .populate("ownerId", "fullName name email")
      .lean();

    return NextResponse.json({ opportunity: populated }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
