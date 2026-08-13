import mongoose, { Schema, Document, Model } from "mongoose";

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "upi",
  "cheque",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Standalone payment ledger. One document per payment received against an
 * invoice. The invoice keeps a denormalized `paidAmount` for fast reads; the
 * truth lives here, so revenue / outstanding figures are always computed via
 * aggregation over this collection.
 */
export interface IPayment extends Document {
  companyId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  /** External reference — bank/UPI/cheque reference number. */
  transactionId?: string;
  note?: string;
  recordedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: [true, "Invoice is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0, "Payment amount cannot be negative"],
    },
    paymentDate: {
      type: Date,
      required: [true, "Payment date is required"],
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: {
        values: PAYMENT_METHODS,
        message: "Method must be one of: " + PAYMENT_METHODS.join(", "),
      },
      default: "bank_transfer",
    },
    transactionId: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

PaymentSchema.index({ companyId: 1, paymentDate: 1 });
PaymentSchema.index({ companyId: 1, invoiceId: 1 });
PaymentSchema.index({ invoiceId: 1 });

const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>("Payment", PaymentSchema);

export default Payment;
