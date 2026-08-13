import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Notification from "@/models/Notification";
import { requireAuth, handleApiError } from "@/lib/guards";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("notifications.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
    }

    const notification = await Notification.findOne({
      _id: objectId,
      companyId,
      userId: user._id,
    }).lean();
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ notification });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Toggle read state on one of the current user's notifications. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("notifications.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
    }

    const notification = await Notification.findOne({
      _id: objectId,
      companyId,
      userId: user._id,
    });
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const wasRead = notification.isRead;
    notification.isRead = body.isRead !== undefined ? !!body.isRead : true;
    await notification.save();

    if (wasRead !== notification.isRead) {
      await logActivity({
        userId: user._id.toString(),
        companyId,
        action: "NOTIFICATION_READ",
        details: `Marked notification "${notification.title}" as ${
          notification.isRead ? "read" : "unread"
        }`,
      });
    }

    return NextResponse.json({ notification });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Delete one of the current user's notifications. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("notifications.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
    }

    const result = await Notification.deleteOne({
      _id: objectId,
      companyId,
      userId: user._id,
    });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "NOTIFICATION_DELETED",
      details: "Deleted a notification",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
