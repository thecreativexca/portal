import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Stored invoice status. The richer statuses (paid, partially_paid, overdue)
 * are derived at read time from the paid amount and due date — see
 * effectiveInvoiceStatus / the aggregation pipeline in the API layer.
 */
export const INVOICE_STATUSES = ["draft", "sent", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** A line item on an invoice. Line total = quantity * rate. */
export interface IInvoiceItem {
  description: string;
  quantity: number;
  rate: number;
}

export interface IInvoice extends Document {
  companyId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  /** Optional project the invoice bills against. */
  projectId?: mongoose.Types.ObjectId;
  invoiceNumber: string;
  /** Subtotal of line items (or manually entered base amount). */
  amount: number;
  /** Tax amount added on top of the subtotal. Total = amount + tax. */
  tax: number;
  /** Denormalized sum of payments received (capped at total). */
  paidAmount: number;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate?: Date;
  items: IInvoiceItem[];
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSchema = new Schema<IInvoiceItem>(
  {
    description: {
      type: String,
      required: [true, "Item description is required"],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 1,
    },
    rate: {
      type: Number,
      required: [true, "Rate is required"],
      min: [0, "Rate cannot be negative"],
      default: 0,
    },
  },
  { _id: false }
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Client is required"],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, "Invoice amount is required"],
      min: [0, "Invoice amount cannot be negative"],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, "Tax cannot be negative"],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, "Paid amount cannot be negative"],
    },
    status: {
      type: String,
      enum: {
        values: INVOICE_STATUSES,
        message: "Status must be one of: " + INVOICE_STATUSES.join(", "),
      },
      default: "draft",
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    items: {
      type: [InvoiceItemSchema],
      default: [],
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
  },
  {
    timestamps: true,
  }
);

// Invoice number must be unique within a company.
InvoiceSchema.index({ companyId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ companyId: 1, clientId: 1 });
InvoiceSchema.index({ companyId: 1, projectId: 1 });

/** Full invoice value including tax. */
export function invoiceTotal(inv: {
  amount: number;
  tax?: number;
}): number {
  return (inv.amount || 0) + (inv.tax || 0);
}

/** Outstanding amount on an invoice (never below zero). */
export function invoiceOutstanding(inv: {
  amount: number;
  tax?: number;
  paidAmount?: number;
}): number {
  return Math.max(0, invoiceTotal(inv) - (inv.paidAmount || 0));
}

/** Derive the display status from stored status + payments + due date. */
export function effectiveInvoiceStatus(inv: {
  status: string;
  amount: number;
  tax?: number;
  paidAmount?: number;
  dueDate?: Date | null;
}): string {
  if (inv.status === "cancelled") return "cancelled";
  if (inv.status === "draft") return "draft";

  const total = invoiceTotal(inv);
  const paid = inv.paidAmount || 0;
  if (paid >= total && total > 0) return "paid";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = inv.dueDate ? new Date(inv.dueDate) : null;
  if (due && due < today) return "overdue";

  if (paid > 0) return "partially_paid";
  return "sent";
}

const Invoice: Model<IInvoice> =
  mongoose.models.Invoice || mongoose.model<IInvoice>("Invoice", InvoiceSchema);

export default Invoice;
