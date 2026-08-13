import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Message from "@/models/Message";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth();
    await dbConnect();

    const userId = user._id;
    const { searchParams } = new URL(request.url);
    const withUserId = searchParams.get("with");

    let messages;

    if (withUserId) {
      // Get conversation between current user and another user
      messages = await Message.find({
        companyId,
        $or: [
          { senderId: userId, receiverId: withUserId },
          { senderId: withUserId, receiverId: userId },
        ],
      })
        .populate("senderId", "fullName name email profileImage")
        .populate("receiverId", "fullName name email profileImage")
        .sort({ createdAt: 1 })
        .lean();

      // Mark unread messages as read
      await Message.updateMany(
        { companyId, senderId: withUserId, receiverId: userId, read: false },
        { read: true }
      );
    } else {
      // Get all conversations - last message with each user
      messages = await Message.aggregate([
        {
          $match: {
            companyId: new mongoose.Types.ObjectId(companyId),
            $or: [{ senderId: userId }, { receiverId: userId }],
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$senderId", userId] },
                "$receiverId",
                "$senderId",
              ],
            },
            lastMessage: { $first: "$$ROOT" },
          },
        },
        { $sort: { "lastMessage.createdAt": -1 } },
      ]);
    }

    return NextResponse.json({ messages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const body = await request.json();
    const { receiverId, text } = body;

    if (!receiverId || !text?.trim()) {
      return NextResponse.json(
        { error: "receiverId and text are required" },
        { status: 400 }
      );
    }

    // Receiver must belong to the same company.
    const receiver = await User.findOne({
      _id: receiverId,
      companyId,
    }).lean();
    if (!receiver) {
      return NextResponse.json(
        { error: "Recipient not found in your company" },
        { status: 400 }
      );
    }

    const message = await Message.create({
      companyId,
      senderId: user._id,
      receiverId,
      text: text.trim(),
    });

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "MESSAGE_SENT",
      details: `Sent a message to ${receiver.fullName || receiver.name || receiverId}`,
    });

    const populated = await Message.findById(message._id)
      .populate("senderId", "fullName name email profileImage")
      .populate("receiverId", "fullName name email profileImage")
      .lean();

    return NextResponse.json({ message: populated }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
