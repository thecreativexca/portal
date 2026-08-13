import mongoose, { Schema, Document, Model } from "mongoose";

export const LEAVE_TYPES = [
  "annual",
  "sick",
  "casual",
  "unpaid",
  "other",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export interface ILeave extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: mongoose.Types.ObjectId;
}

const LeaveSchema = new Schema<ILeave>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    leaveType: {
      type: String,
      enum: {
        values: LEAVE_TYPES,
        message: "Leave type must be one of: " + LEAVE_TYPES.join(", "),
      },
      default: "annual",
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
      minlength: [10, "Reason must be at least 10 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

LeaveSchema.index({ userId: 1, createdAt: -1 });
LeaveSchema.index({ status: 1 });
LeaveSchema.index({ startDate: -1 });

const Leave: Model<ILeave> =
  mongoose.models.Leave || mongoose.model<ILeave>("Leave", LeaveSchema);

export default Leave;