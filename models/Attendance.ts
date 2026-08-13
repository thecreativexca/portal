import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAttendance extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  /** Hours between check-in and check-out, computed on checkout. */
  totalHours?: number;
  /** Hours beyond the company's standard workday, computed on checkout. */
  overtimeHours?: number;
  /** Optional free-form location string reported at check-in. */
  location?: string;
  status: "present" | "half-day" | "absent";
}

const AttendanceSchema = new Schema<IAttendance>(
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
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    checkIn: {
      type: Date,
    },
    checkOut: {
      type: Date,
    },
    totalHours: {
      type: Number,
      min: [0, "Total hours cannot be negative"],
      default: 0,
    },
    overtimeHours: {
      type: Number,
      min: [0, "Overtime hours cannot be negative"],
      default: 0,
    },
    location: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["present", "half-day", "absent"],
      default: "absent",
    },
  },
  {
    timestamps: true,
  }
);

// One attendance record per user per day
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ date: -1 });
AttendanceSchema.index({ userId: 1 });

const Attendance: Model<IAttendance> =
  mongoose.models.Attendance ||
  mongoose.model<IAttendance>("Attendance", AttendanceSchema);

export default Attendance;