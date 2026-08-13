import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPermission extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  key: string;
  module: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema<IPermission>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Permission name is required"],
      trim: true,
    },
    key: {
      type: String,
      required: [true, "Permission key is required"],
      trim: true,
    },
    module: {
      type: String,
      required: [true, "Module is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Permission key must be unique within a company
PermissionSchema.index({ companyId: 1, key: 1 }, { unique: true });

const Permission: Model<IPermission> =
  mongoose.models.Permission ||
  mongoose.model<IPermission>("Permission", PermissionSchema);

export default Permission;
