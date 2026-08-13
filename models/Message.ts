import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessage extends Document {
  companyId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  text: string;
  read: boolean;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender is required"],
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Receiver is required"],
    },
    text: {
      type: String,
      required: [true, "Message text is required"],
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    // `createdAt` / `updatedAt` are managed by Mongoose (the manual `createdAt`
    // field was removed in the production pass — timestamps now own both).
    timestamps: true,
  }
);

MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
MessageSchema.index({ receiverId: 1, read: 1 });

const Message: Model<IMessage> =
  mongoose.models.Message ||
  mongoose.model<IMessage>("Message", MessageSchema);

export default Message;