import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import TimeLog from "@/models/TimeLog";
import { requireAuth, handleApiError } from "@/lib/guards";

export async function GET() {
  try {
    const { user, companyId } = await requireAuth();
    await dbConnect();

    const timer = await TimeLog.findOne({
      companyId,
      userId: user._id,
      endTime: null,
    })
      .populate("taskId", "title status")
      .lean();

    return NextResponse.json({ timer: timer || null });
  } catch (error) {
    return handleApiError(error);
  }
}
