import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITimeLog extends Document {
  companyId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** When the timer was started / the log entry begins. */
  startTime: Date;
  /** When the timer stopped. Null while the timer is running. */
  endTime?: Date | null;
  /** Derived duration; null while running. */
  durationMinutes?: number | null;
  notes?: string;
  /** Inherited from the task at creation time, but editable. */
  billable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TimeLogSchema = new Schema<ITimeLog>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: [true, "Task ID is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: Date,
      default: null,
    },
    durationMinutes: {
      type: Number,
      min: [0, "Duration cannot be negative"],
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
    billable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// A user may only run one timer at a time (partial unique index; Mongo 4.2+).
TimeLogSchema.index(
  { companyId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { endTime: null } }
);

TimeLogSchema.index({ taskId: 1, startTime: -1 });
TimeLogSchema.index({ userId: 1, startTime: -1 });

const TimeLog: Model<ITimeLog> =
  mongoose.models.TimeLog || mongoose.model<ITimeLog>("TimeLog", TimeLogSchema);

export default TimeLog;
