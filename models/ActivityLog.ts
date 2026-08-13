import mongoose, { Schema, Document, Model } from "mongoose";

export interface IActivityLog extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  action: string;
  details: string;
  timestamp: Date;
  /** Optional link to a task for per-task activity feeds. */
  taskId?: mongoose.Types.ObjectId;
}

const ActivityLogSchema = new Schema<IActivityLog>(
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
    action: {
      type: String,
      required: [true, "Action is required"],
      trim: true,
    },
    details: {
      type: String,
      required: [true, "Details are required"],
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
ActivityLogSchema.index({ userId: 1, timestamp: -1 });
ActivityLogSchema.index({ action: 1 });
ActivityLogSchema.index({ timestamp: -1 });
ActivityLogSchema.index({ taskId: 1, timestamp: -1 });

const ActivityLog: Model<IActivityLog> =
  mongoose.models.ActivityLog ||
  mongoose.model<IActivityLog>("ActivityLog", ActivityLogSchema);

export default ActivityLog;