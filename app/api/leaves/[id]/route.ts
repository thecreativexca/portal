import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Leave from "@/models/Leave";
import { logActivity } from "@/lib/logActivity";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ceo") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const leave = await Leave.findById(id).populate("userId", "name email");
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    if (leave.status !== "pending") {
      return NextResponse.json(
        { error: "Leave has already been " + leave.status },
        { status: 400 }
      );
    }

    leave.status = status;
    leave.approvedBy = (session.user as any).id;
    await leave.save();

    await logActivity({
      userId: (session.user as any).id,
      action: status === "approved" ? "APPROVE_LEAVE" : "REJECT_LEAVE",
      details: `${status === "approved" ? "Approved" : "Rejected"} leave for ${(leave.userId as any).name} (${leave.startDate.toLocaleDateString()} - ${leave.endDate.toLocaleDateString()})`,
    });

    return NextResponse.json({ leave });
  } catch (error) {
    console.error("Error updating leave:", error);
    return NextResponse.json(
      { error: "Failed to update leave" },
      { status: 500 }
    );
  }
}