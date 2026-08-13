import mongoose, { Schema, Document, Model } from "mongoose";

export const FOLLOWUP_TYPES = [
  "call",
  "email",
  "meeting",
  "proposal",
  "other",
] as const;
export type FollowUpType = (typeof FOLLOWUP_TYPES)[number];

export const FOLLOWUP_STATUSES = ["pending", "completed", "missed"] as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

export interface IFollowUp extends Document {
  companyId: mongoose.Types.ObjectId;
  /** Optional link to the lead being followed up on. */
  leadId?: mongoose.Types.ObjectId;
  /** Optional link to the opportunity being followed up on. */
  opportunityId?: mongoose.Types.ObjectId;
  title: string;
  type: FollowUpType;
  /** When the reminder fires. */
  dueAt: Date;
  status: FollowUpStatus;
  notes?: string;
  /** Who the reminder is assigned to (defaults to creator). */
  assignedToId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  completedAt?: Date | null;
  /** Soft-delete marker. null means active. */
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const FollowUpSchema = new Schema<IFollowUp>(
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
    opportunityId: {
      type: Schema.Types.ObjectId,
      ref: "Opportunity",
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: {
        values: FOLLOWUP_TYPES,
        message: "Type must be one of: " + FOLLOWUP_TYPES.join(", "),
      },
      default: "call",
    },
    dueAt: {
      type: Date,
      required: [true, "Due date is required"],
    },
    status: {
      type: String,
      enum: {
        values: FOLLOWUP_STATUSES,
        message: "Status must be one of: " + FOLLOWUP_STATUSES.join(", "),
      },
      default: "pending",
    },
    notes: {
      type: String,
      trim: true,
    },
    assignedToId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completedAt: {
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

FollowUpSchema.index({ companyId: 1, dueAt: 1 });
FollowUpSchema.index({ companyId: 1, status: 1, dueAt: 1 });
FollowUpSchema.index({ companyId: 1, assignedToId: 1 });
FollowUpSchema.index({ companyId: 1, leadId: 1 });
FollowUpSchema.index({ companyId: 1, opportunityId: 1 });

const FollowUp: Model<IFollowUp> =
  mongoose.models.FollowUp ||
  mongoose.model<IFollowUp>("FollowUp", FollowUpSchema);

export default FollowUp;
