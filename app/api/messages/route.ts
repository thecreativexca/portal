import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Message from "@/models/Message";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = (session.user as any).id;
    const { searchParams } = new URL(request.url);
    const withUserId = searchParams.get("with");

    let messages;

    if (withUserId) {
      // Get conversation between current user and another user
      messages = await Message.find({
        $or: [
          { senderId: userId, receiverId: withUserId },
          { senderId: withUserId, receiverId: userId },
        ],
      })
        .populate("senderId", "name email avatar")
        .populate("receiverId", "name email avatar")
        .sort({ createdAt: 1 })
        .lean();

      // Mark unread messages as read
      await Message.updateMany(
        { senderId: withUserId, receiverId: userId, read: false },
        { read: true }
      );
    } else {
      // Get all conversations - last message with each user
      messages = await Message.aggregate([
        {
          $match: {
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
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { receiverId, text } = body;

    if (!receiverId || !text?.trim()) {
      return NextResponse.json(
        { error: "receiverId and text are required" },
        { status: 400 }
      );
    }

    const message = await Message.create({
      senderId: (session.user as any).id,
      receiverId,
      text: text.trim(),
    });

    const populated = await Message.findById(message._id)
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .lean();

    return NextResponse.json({ message: populated }, { status: 201 });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}