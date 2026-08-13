import mongoose, { Schema, Document, Model } from "mongoose";

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in-progress",
  "review",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Maximum allowed size of a stored attachment (5 MB, base64 inflated). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export interface IAttachment {
  _id: mongoose.Types.ObjectId;
  /** Original file name, e.g. `wireframe-v2.pdf`. */
  name: string;
  mimeType?: string;
  /** Byte size of the original file. */
  size: number;
  /** Base64 data-URI of the file contents. */
  data: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

export interface IComment {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  text: string;
  timestamp: Date;
}

export interface ITask extends Document {
  companyId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  assignedTo: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: Date | null;
  dueDate?: Date | null;
  /** Estimated effort in hours. */
  estimatedHours?: number | null;
  /** Tasks that must be completed before this one can start. */
  dependencyTaskIds: mongoose.Types.ObjectId[];
  labels: string[];
  attachments: IAttachment[];
  /** Whether hours logged on this task are billable to the client. */
  billable: boolean;
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    name: {
      type: String,
      required: [true, "Attachment name is required"],
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    data: {
      type: String,
      required: [true, "Attachment data is required"],
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const CommentSchema = new Schema<IComment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: [true, "Comment text is required"],
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const TaskSchema = new Schema<ITask>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project ID is required"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Assignee is required"],
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: TASK_STATUSES,
        message: "Status must be one of: " + TASK_STATUSES.join(", "),
      },
      default: "todo",
    },
    priority: {
      type: String,
      enum: {
        values: TASK_PRIORITIES,
        message: "Priority must be one of: " + TASK_PRIORITIES.join(", "),
      },
      default: "medium",
    },
    startDate: {
      type: Date,
    },
    dueDate: {
      type: Date,
    },
    estimatedHours: {
      type: Number,
      min: [0, "Estimated hours cannot be negative"],
    },
    dependencyTaskIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    labels: [
      {
        type: String,
        trim: true,
      },
    ],
    attachments: [AttachmentSchema],
    billable: {
      type: Boolean,
      default: true,
    },
    comments: [CommentSchema],
  },
  {
    timestamps: true,
  }
);

TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ assignedTo: 1 });
TaskSchema.index({ companyId: 1, status: 1, dueDate: 1 });
// Cover "blocked by" lookups in the workload / dependency views.
TaskSchema.index({ dependencyTaskIds: 1 });

const Task: Model<ITask> =
  mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);

export default Task;
