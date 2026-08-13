import mongoose from "mongoose";
import Lead, { LEAD_STAGES, LEAD_STAGE_LABELS, LeadStage } from "@/models/Lead";
import Opportunity from "@/models/Opportunity";
import { HttpError } from "./guards";
import { logActivity } from "./logActivity";

const OWNER_POPULATE = "fullName name email";

export interface MoveStageResult {
  lead: Record<string, any> | null;
  changed: boolean;
  opportunityChanged: boolean;
}

/**
 * Move a lead to a new pipeline stage, keeping the linked opportunity and the
 * audit trail in sync. Throws HttpError for invalid stage / missing lead so the
 * caller can map it through handleApiError.
 */
export async function moveLeadStage(params: {
  actor: { _id: mongoose.Types.ObjectId; toString(): string };
  companyId: string;
  leadId: string;
  toStage: string;
  note?: string;
}): Promise<MoveStageResult> {
  const { actor, companyId, leadId, toStage, note } = params;

  if (!(LEAD_STAGES as readonly string[]).includes(toStage)) {
    throw new HttpError(
      400,
      `Stage must be one of: ${LEAD_STAGES.join(", ")}`
    );
  }

  const lead = await Lead.findOne({
    _id: leadId,
    companyId,
    deletedAt: null,
  });
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  const prevStage = lead.stage;
  if (prevStage === toStage) {
    return {
      lead: await Lead.findById(lead._id).populate("ownerId", OWNER_POPULATE).lean(),
      changed: false,
      opportunityChanged: false,
    };
  }

  const now = new Date();
  lead.stage = toStage as LeadStage;
  lead.stageChangedAt = now;
  if (toStage === "won" || toStage === "lost") {
    lead.closedAt = lead.closedAt || now;
  } else {
    lead.closedAt = null;
  }
  await lead.save();

  await logActivity({
    userId: actor._id.toString(),
    companyId,
    action: "MOVE_LEAD_STAGE",
    details: `Moved lead "${lead.companyName}" from ${LEAD_STAGE_LABELS[prevStage]} to ${LEAD_STAGE_LABELS[toStage as LeadStage]}`,
  });

  // Sync the linked opportunity (if any) so the pipeline stays in lock-step.
  let opportunityChanged = false;
  const opportunity = await Opportunity.findOne({
    companyId,
    leadId: lead._id,
    deletedAt: null,
  });
  if (opportunity && opportunity.stage !== toStage) {
    opportunity.stage = toStage as LeadStage;
    if (toStage === "won" || toStage === "lost") {
      opportunity.closedAt = opportunity.closedAt || now;
    } else {
      opportunity.closedAt = null;
    }
    opportunity.timeline.push({
      type:
        toStage === "won"
          ? "won"
          : toStage === "lost"
          ? "lost"
          : "stage_changed",
      title: `Moved to ${LEAD_STAGE_LABELS[toStage as LeadStage]}`,
      description: note,
      userId: actor._id,
      at: now,
    });
    await opportunity.save();
    opportunityChanged = true;
  }

  const populated = await Lead.findById(lead._id)
    .populate("ownerId", OWNER_POPULATE)
    .lean();

  return { lead: populated, changed: true, opportunityChanged };
}
