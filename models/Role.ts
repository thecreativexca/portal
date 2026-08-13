import mongoose, { Schema, Document, Model } from "mongoose";

export const ROLE_KEYS = [
  "ceo",
  "hr",
  "project_manager",
  "team_lead",
  "employee",
  "accounts",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export interface IRole extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  key: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Role name is required"],
      trim: true,
    },
    key: {
      type: String,
      required: [true, "Role key is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Role key must be unique within a company
RoleSchema.index({ companyId: 1, key: 1 }, { unique: true });

const Role: Model<IRole> =
  mongoose.models.Role || mongoose.model<IRole>("Role", RoleSchema);

export default Role;
