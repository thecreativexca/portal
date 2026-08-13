import mongoose, { Schema, Document, Model } from "mongoose";

/** Sales pipeline stages, ordered from first contact to closed. */
export const LEAD_STAGES = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

/** The open stages that make up the active pipeline value. */
export const OPEN_STAGES: LeadStage[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
];

export interface ILead extends Document {
  companyId: mongoose.Types.ObjectId;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  /** Where the lead came from — free text, grouped for analytics. */
  source?: string;
  estimatedValue?: number;
  stage: LeadStage;
  ownerId?: mongoose.Types.ObjectId;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  /** When the stage last changed (drives time-in-stage analytics). */
  stageChangedAt: Date;
  /** When the lead was won or lost. */
  closedAt?: Date | null;
  /** Set when this lead is converted into an Opportunity. */
  convertedAt?: Date | null;
  /** Soft-delete marker. null means the lead is active. */
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    contactName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      trim: true,
    },
    estimatedValue: {
      type: Number,
      min: [0, "Estimated value cannot be negative"],
    },
    stage: {
      type: String,
      enum: {
        values: LEAD_STAGES,
        message: "Stage must be one of: " + LEAD_STAGES.join(", "),
      },
      default: "lead",
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
    stageChangedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    convertedAt: {
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

LeadSchema.index({ companyId: 1, stage: 1, deletedAt: 1 });
LeadSchema.index({ companyId: 1, ownerId: 1 });
LeadSchema.index({ companyId: 1, source: 1 });
LeadSchema.index({ companyId: 1, stageChangedAt: 1 });

const Lead: Model<ILead> =
  mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema);

export default Lead;
