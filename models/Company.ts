import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICompany extends Document {
  name: string;
  legalName?: string;
  businessType?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  logo?: string;
  timezone?: string;
  currency?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    legalName: {
      type: String,
      trim: true,
    },
    businessType: {
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
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    currency: {
      type: String,
      default: "INR",
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

const Company: Model<ICompany> =
  mongoose.models.Company ||
  mongoose.model<ICompany>("Company", CompanySchema);

export default Company;
