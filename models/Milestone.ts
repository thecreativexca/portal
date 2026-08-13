import mongoose, { Schema, Document, Model } from "mongoose";

export const MILESTONE_STATUSES = [
  "pending",
  "in-progress",
  "completed",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface IMilestone extends Document {
  companyId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  title: string;
  dueDate?: Date | null;
  status: MilestoneStatus;
  /** Set when the milestone is marked completed, cleared on reopen. */
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project ID is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Milestone title is required"],
      trim: true,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: {
        values: MILESTONE_STATUSES,
        message: "Status must be one of: " + MILESTONE_STATUSES.join(", "),
      },
      default: "pending",
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

MilestoneSchema.index({ projectId: 1, dueDate: 1 });
MilestoneSchema.index({ projectId: 1, status: 1 });

const Milestone: Model<IMilestone> =
  mongoose.models.Milestone ||
  mongoose.model<IMilestone>("Milestone", MilestoneSchema);

export default Milestone;
