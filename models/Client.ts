import mongoose, { Schema, Document, Model } from "mongoose";

export const CLIENT_STATUSES = ["lead", "active", "completed", "on-hold"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export interface IClient extends Document {
  companyId: mongoose.Types.ObjectId;
  clientName: string;
  legalName?: string;
  industry?: string;
  website?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  accountManagerId?: mongoose.Types.ObjectId;
  contractValue?: number;
  contractStartDate?: Date;
  contractEndDate?: Date;
  renewalDate?: Date;
  status: ClientStatus;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  /** Soft-delete marker. null means the client is active. */
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    clientName: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
    },
    legalName: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    gstNumber: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    primaryContactName: {
      type: String,
      trim: true,
    },
    primaryContactEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    primaryContactPhone: {
      type: String,
      trim: true,
    },
    accountManagerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    contractValue: {
      type: Number,
      min: [0, "Contract value cannot be negative"],
    },
    contractStartDate: {
      type: Date,
    },
    contractEndDate: {
      type: Date,
    },
    renewalDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: {
        values: CLIENT_STATUSES,
        message: "Status must be one of: " + CLIENT_STATUSES.join(", "),
      },
      default: "lead",
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
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ClientSchema.index({ companyId: 1, clientName: 1 });
ClientSchema.index({ companyId: 1, status: 1 });
ClientSchema.index({ companyId: 1, accountManagerId: 1 });
ClientSchema.index({ companyId: 1, deletedAt: 1 });
// GST number must be unique within a company, when provided.
ClientSchema.index(
  { companyId: 1, gstNumber: 1 },
  { unique: true, sparse: true }
);

const Client: Model<IClient> =
  mongoose.models.Client || mongoose.model<IClient>("Client", ClientSchema);

export default Client;
