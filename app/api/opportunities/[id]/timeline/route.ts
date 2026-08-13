import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Opportunity, {
  TIMELINE_EVENT_TYPES,
  TimelineEventType,
} from "@/models/Opportunity";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

/**
 * Add a timeline event to an opportunity (e.g. a manual note or a reminder
 * that was attached). Stage / proposal changes are stamped automatically by the
 * PATCH handler; this endpoint covers free-form notes.
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

    const body = await request.json();
    const type = body.type || "note";
    if (!(TIMELINE_EVENT_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json(
        { error: `Event type must be one of: ${TIMELINE_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!body.title || !String(body.title).trim()) {
      return NextResponse.json(
        { error: "Event title is required" },
        { status: 400 }
      );
    }

    opportunity.timeline.push({
      type: type as TimelineEventType,
      title: String(body.title).trim(),
      description: body.description,
      userId: actor._id,
      at: new Date(),
    });
    await opportunity.save();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "ADD_OPPORTUNITY_NOTE",
      details: `Added note to opportunity "${opportunity.opportunityName}"`,
    });

    const updated = await Opportunity.findById(objectId)
      .populate("ownerId", "fullName name email")
      .lean();

    return NextResponse.json({ opportunity: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
