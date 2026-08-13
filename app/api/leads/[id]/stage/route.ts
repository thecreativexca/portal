import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { moveLeadStage } from "@/lib/leadStage";
import { toObjectId } from "@/lib/ids";

/**
 * Stage movement endpoint for the pipeline board. Moves a lead to a new stage
 * and syncs its linked opportunity (see lib/leadStage.ts).
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
    if (!toObjectId(id)) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const body = await request.json();
    const toStage = body.stage;
    if (!toStage) {
      return NextResponse.json(
        { error: "Target stage is required" },
        { status: 400 }
      );
    }

    const result = await moveLeadStage({
      actor,
      companyId,
      leadId: id,
      toStage,
      note: body.note,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
