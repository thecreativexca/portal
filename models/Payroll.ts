import mongoose, { Schema, Document, Model } from "mongoose";

export const PAYROLL_PAYMENT_STATUSES = ["pending", "paid", "cancelled"] as const;
export type PayrollPaymentStatus = (typeof PAYROLL_PAYMENT_STATUSES)[number];

/** Net pay = basic + bonus - deduction (never below zero). */
export function payrollNetSalary(
  basic: number,
  bonus: number,
  deduction: number
): number {
  return Math.max(0, (basic || 0) + (bonus || 0) - (deduction || 0));
}

export interface IPayroll extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** Pay period as "YYYY-MM" (local calendar month). */
  month: string;
  basicSalary: number;
  bonus: number;
  deduction: number;
  /** Derived: basicSalary + bonus - deduction. Kept denormalized for fast reads. */
  netSalary: number;
  paymentStatus: PayrollPaymentStatus;
  paidAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollSchema = new Schema<IPayroll>(
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
      required: [true, "Employee is required"],
      index: true,
    },
    month: {
      type: String,
      required: [true, "Pay period (YYYY-MM) is required"],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
    },
    basicSalary: {
      type: Number,
      default: 0,
      min: [0, "Basic salary cannot be negative"],
    },
    bonus: {
      type: Number,
      default: 0,
      min: [0, "Bonus cannot be negative"],
    },
    deduction: {
      type: Number,
      default: 0,
      min: [0, "Deduction cannot be negative"],
    },
    netSalary: {
      type: Number,
      default: 0,
      min: [0, "Net salary cannot be negative"],
    },
    paymentStatus: {
      type: String,
      enum: {
        values: PAYROLL_PAYMENT_STATUSES,
        message:
          "Status must be one of: " + PAYROLL_PAYMENT_STATUSES.join(", "),
      },
      default: "pending",
    },
    paidAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// One payroll record per employee per month.
PayrollSchema.index({ companyId: 1, userId: 1, month: 1 }, { unique: true });
PayrollSchema.index({ companyId: 1, month: 1 });
PayrollSchema.index({ companyId: 1, paymentStatus: 1 });

const Payroll: Model<IPayroll> =
  mongoose.models.Payroll || mongoose.model<IPayroll>("Payroll", PayrollSchema);

export default Payroll;
