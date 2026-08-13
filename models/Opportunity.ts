import mongoose, { Schema, Document, Model } from "mongoose";
import { LEAD_STAGES, LeadStage } from "./Lead";

export const PROPOSAL_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** Timeline event types for the opportunity timeline view. */
export const TIMELINE_EVENT_TYPES = [
  "created",
  "stage_changed",
  "proposal",
  "note",
  "followup",
  "won",
  "lost",
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export interface ITimelineEvent {
  type: TimelineEventType;
  title: string;
  description?: string;
  userId?: mongoose.Types.ObjectId;
  at: Date;
}

export interface IOpportunity extends Document {
  companyId: mongoose.Types.ObjectId;
  /** The lead this opportunity was created from (optional for manual entries). */
  leadId?: mongoose.Types.ObjectId;
  opportunityName: string;
  /** Deal value — overrides the lead's estimate once negotiated. */
  value?: number;
  expectedCloseDate?: Date;
  /** Likelihood 0-100 of closing. */
  probability: number;
  stage: LeadStage;
  proposal?: {
    sentAt?: Date;
    dueAt?: Date;
    status?: ProposalStatus;
  };
  timeline: ITimelineEvent[];
  ownerId?: mongoose.Types.ObjectId;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  /** When the deal was won or lost. */
  closedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TimelineEventSchema = new Schema<ITimelineEvent>(
  {
    type: {
      type: String,
      enum: {
        values: TIMELINE_EVENT_TYPES,
        message: "Event type must be one of: " + TIMELINE_EVENT_TYPES.join(", "),
      },
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const OpportunitySchema = new Schema<IOpportunity>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      index: true,
    },
    opportunityName: {
      type: String,
      required: [true, "Opportunity name is required"],
      trim: true,
    },
    value: {
      type: Number,
      min: [0, "Value cannot be negative"],
    },
    expectedCloseDate: {
      type: Date,
    },
    probability: {
      type: Number,
      min: [0, "Probability cannot be below 0"],
      max: [100, "Probability cannot exceed 100"],
      default: 0,
    },
    stage: {
      type: String,
      enum: {
        values: LEAD_STAGES,
        message: "Stage must be one of: " + LEAD_STAGES.join(", "),
      },
      default: "qualified",
    },
    proposal: {
      sentAt: Date,
      dueAt: Date,
      status: {
        type: String,
        enum: {
          values: PROPOSAL_STATUSES,
          message:
            "Proposal status must be one of: " + PROPOSAL_STATUSES.join(", "),
        },
        default: "draft",
      },
    },
    timeline: {
      type: [TimelineEventSchema],
      default: [],
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

OpportunitySchema.index({ companyId: 1, stage: 1, deletedAt: 1 });
OpportunitySchema.index({ companyId: 1, leadId: 1, deletedAt: 1 });
OpportunitySchema.index({ companyId: 1, ownerId: 1 });

const Opportunity: Model<IOpportunity> =
  mongoose.models.Opportunity ||
  mongoose.model<IOpportunity>("Opportunity", OpportunitySchema);

export default Opportunity;
