import mongoose, { Schema, Document, Model } from "mongoose";

export const APPROVAL_TYPES = [
  "leave",
  "expense",
  "invoice",
  "payroll",
  "project",
  "document",
  "general",
] as const;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

export type ApprovalType = (typeof APPROVAL_TYPES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface IApproval extends Document {
  companyId: mongoose.Types.ObjectId;
  type: ApprovalType;
  /** Human-readable subject shown in the approval inbox. */
  title: string;
  description?: string;
  /** The record this approval governs (leave, expense, invoice, ...). */
  entityId?: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  status: ApprovalStatus;
  remarks?: string;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalSchema = new Schema<IApproval>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: APPROVAL_TYPES,
        message: "Type must be one of: " + APPROVAL_TYPES.join(", "),
      },
      default: "general",
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Requested by is required"],
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: {
        values: APPROVAL_STATUSES,
        message: "Status must be one of: " + APPROVAL_STATUSES.join(", "),
      },
      default: "pending",
    },
    remarks: {
      type: String,
      trim: true,
    },
    decidedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

ApprovalSchema.index({ companyId: 1, status: 1, createdAt: -1 });
ApprovalSchema.index({ requestedBy: 1, createdAt: -1 });

const Approval: Model<IApproval> =
  mongoose.models.Approval ||
  mongoose.model<IApproval>("Approval", ApprovalSchema);

export default Approval;
