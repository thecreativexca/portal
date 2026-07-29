import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISettings extends Document {
  companyName: string;
  workingHours: {
    start: string;
    end: string;
  };
  workingDays: string[];
  leavePolicy: {
    annualLeaves: number;
    sickLeaves: number;
    carryForward: boolean;
  };
}

const SettingsSchema = new Schema<ISettings>(
  {
    companyName: {
      type: String,
      default: "My Company",
      trim: true,
    },
    workingHours: {
      start: { type: String, default: "09:00" },
      end: { type: String, default: "18:00" },
    },
    workingDays: {
      type: [String],
      default: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    },
    leavePolicy: {
      annualLeaves: { type: Number, default: 20 },
      sickLeaves: { type: Number, default: 10 },
      carryForward: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

const Settings: Model<ISettings> =
  mongoose.models.Settings ||
  mongoose.model<ISettings>("Settings", SettingsSchema);

export default Settings;