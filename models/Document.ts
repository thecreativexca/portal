import mongoose, { Schema, Document, Model } from "mongoose";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const DEFAULT_FOLDER = "General";

/** Optional entity types a document can be attached to. */
export const RELATED_ENTITY_TYPES = [
  "project",
  "task",
  "client",
  "lead",
  "invoice",
  "expense",
] as const;

export interface IDocument extends Document {
  companyId: mongoose.Types.ObjectId;
  folder: string;
  name: string;
  /** Download URL served by /api/documents/[id]/download. */
  url: string;
  mimeType?: string;
  size?: number;
  /** Base64 file payload — excluded from list queries to keep them light. */
  data?: string;
  uploadedBy: mongoose.Types.ObjectId;
  relatedEntityType?: string;
  relatedEntityId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    folder: {
      type: String,
      default: DEFAULT_FOLDER,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Document name is required"],
      trim: true,
    },
    url: {
      type: String,
      required: [true, "Document URL is required"],
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    size: {
      type: Number,
      min: [0, "Size cannot be negative"],
    },
    data: {
      type: String,
      select: false,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Uploaded by is required"],
    },
    relatedEntityType: {
      type: String,
      trim: true,
    },
    relatedEntityId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

DocumentSchema.index({ companyId: 1, folder: 1, createdAt: -1 });
DocumentSchema.index({ companyId: 1, relatedEntityType: 1, relatedEntityId: 1 });
DocumentSchema.index({ uploadedBy: 1, createdAt: -1 });

const DocumentModel: Model<IDocument> =
  mongoose.models.Document || mongoose.model<IDocument>("Document", DocumentSchema);

export default DocumentModel;
