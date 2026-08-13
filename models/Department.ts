import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDepartment extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  managerId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Department name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// A department name must be unique within a company
DepartmentSchema.index({ companyId: 1, name: 1 }, { unique: true });

const Department: Model<IDepartment> =
  mongoose.models.Department ||
  mongoose.model<IDepartment>("Department", DepartmentSchema);

export default Department;
