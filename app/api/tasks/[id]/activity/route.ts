import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import ActivityLog from "@/models/ActivityLog";
import { requireAuth, handleApiError } from "@/lib/guards";
import { toObjectId } from "@/lib/ids";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("tasks.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const logs = await ActivityLog.find({ taskId: objectId, companyId })
      .populate("userId", "fullName name email")
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ activity: logs });
  } catch (error) {
    return handleApiError(error);
  }
}
