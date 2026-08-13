import mongoose, { Schema, Document, Model } from "mongoose";

export const EXPENSE_CATEGORIES = [
  "travel",
  "meals",
  "software",
  "hardware",
  "office",
  "marketing",
  "rent",
  "utilities",
  "professional-services",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface IExpense extends Document {
  companyId: mongoose.Types.ObjectId;
  category: ExpenseCategory;
  amount: number;
  date: Date;
  /** Optional link to the project this expense belongs to. */
  projectId?: mongoose.Types.ObjectId;
  description?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    category: {
      type: String,
      enum: {
        values: EXPENSE_CATEGORIES,
        message: "Category must be one of: " + EXPENSE_CATEGORIES.join(", "),
      },
      required: [true, "Category is required"],
    },
    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0, "Expense amount cannot be negative"],
    },
    date: {
      type: Date,
      required: [true, "Expense date is required"],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    description: {
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

ExpenseSchema.index({ companyId: 1, date: 1 });
ExpenseSchema.index({ companyId: 1, category: 1 });
ExpenseSchema.index({ companyId: 1, projectId: 1 });

const Expense: Model<IExpense> =
  mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);

export default Expense;
