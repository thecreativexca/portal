import mongoose, { Schema, Document, Model } from "mongoose";

export const PROJECT_STATUSES = [
  "active",
  "completed",
  "on-hold",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export interface IProject extends Document {
  companyId: mongoose.Types.ObjectId;
  /** Name of the project (linked as `projectId -> projectName` by the
   * tasks module). */
  projectName: string;
  projectCode?: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  /** Overall progress 0-100, maintained by the project manager. */
  progress: number;
  createdBy: mongoose.Types.ObjectId;
  teamMemberIds: mongoose.Types.ObjectId[];
  projectManagerId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  /** Allocated budget (company currency). */
  budget?: number;
  /** Estimated effort in hours for the whole project. */
  estimatedHours?: number;
  /** Hours actually logged against the project (PM-maintained). */
  actualHours?: number;
  startDate?: Date;
  endDate?: Date;
  /** Denormalized list of milestone ids linked to this project. */
  milestoneIds: mongoose.Types.ObjectId[];
}

const ProjectSchema = new Schema<IProject>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    projectName: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
    },
    projectCode: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: PROJECT_STATUSES,
        message: "Status must be one of: " + PROJECT_STATUSES.join(", "),
      },
      default: "active",
    },
    priority: {
      type: String,
      enum: {
        values: PROJECT_PRIORITIES,
        message: "Priority must be one of: " + PROJECT_PRIORITIES.join(", "),
      },
      default: "medium",
    },
    progress: {
      type: Number,
      min: [0, "Progress cannot be below 0"],
      max: [100, "Progress cannot exceed 100"],
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teamMemberIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    projectManagerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      index: true,
    },
    budget: {
      type: Number,
      min: [0, "Budget cannot be negative"],
    },
    estimatedHours: {
      type: Number,
      min: [0, "Estimated hours cannot be negative"],
    },
    actualHours: {
      type: Number,
      min: [0, "Actual hours cannot be negative"],
      default: 0,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    milestoneIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Milestone",
      },
    ],
  },
  {
    timestamps: true,
  }
);

ProjectSchema.index({ teamMemberIds: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ priority: 1 });
// Project code should be unique per company when provided.
ProjectSchema.index(
  { companyId: 1, projectCode: 1 },
  { unique: true, sparse: true }
);

const Project: Model<IProject> =
  mongoose.models.Project ||
  mongoose.model<IProject>("Project", ProjectSchema);

export default Project;
