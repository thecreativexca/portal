import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Leave from "@/models/Leave";
import { LEAVE_TYPES } from "@/models/Leave";
import Approval from "@/models/Approval";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { notifyUser } from "@/lib/notify";
import { toObjectId } from "@/lib/ids";

/** Approve / reject a pending leave (requires leaves.approve). */
async function decideLeave(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("leaves.approve");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid leave id" }, { status: 400 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const leave = await Leave.findOne({ _id: objectId, companyId }).populate(
      "userId",
      "fullName name email"
    );
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
    leave.approvedBy = user._id;
    await leave.save();

    const requesterId = (leave.userId as any)?._id?.toString() || leave.userId.toString();
    const dateRange = `${leave.startDate.toLocaleDateString()} - ${leave.endDate.toLocaleDateString()}`;

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: status === "approved" ? "APPROVE_LEAVE" : "REJECT_LEAVE",
      details: `${status === "approved" ? "Approved" : "Rejected"} leave for ${(leave.userId as any).fullName} (${dateRange})`,
    });

    // Mirror the decision into the approval workflow so it shows in the inbox.
    try {
      await Approval.create({
        companyId,
        type: "leave",
        entityId: leave._id,
        title: `Leave request (${dateRange})`,
        requestedBy: requesterId,
        approvedBy: user._id,
        status,
        decidedAt: new Date(),
      });
    } catch (error) {
      console.error("Failed to mirror leave decision into approvals:", error);
    }

    await notifyUser({
      companyId,
      userId: requesterId,
      title: status === "approved" ? "Leave approved" : "Leave rejected",
      message: `Your leave request (${dateRange}) was ${status}`,
      type: "leave",
      link: "/leaves",
    });

    return NextResponse.json({ leave });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Edit one's own pending leave (dates, reason, or type). */
async function editOwnLeave(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid leave id" }, { status: 400 });
    }

    const leave = await Leave.findOne({ _id: objectId, companyId });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    if (leave.userId.toString() !== user._id.toString()) {
      return NextResponse.json(
        { error: "You can only edit your own leave requests" },
        { status: 403 }
      );
    }

    if (leave.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending leave requests can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { startDate, endDate, reason, leaveType } = body;

    if (startDate === undefined && endDate === undefined && reason === undefined && leaveType === undefined) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    if (startDate !== undefined) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
      }
      leave.startDate = start;
    }

    if (endDate !== undefined) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
      }
      leave.endDate = end;
    }

    if (leave.endDate.getTime() < leave.startDate.getTime()) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    if (reason !== undefined) {
      if (typeof reason !== "string" || reason.length < 10) {
        return NextResponse.json(
          { error: "Reason must be at least 10 characters" },
          { status: 400 }
        );
      }
      leave.reason = reason;
    }

    if (leaveType !== undefined) {
      if (!LEAVE_TYPES.includes(leaveType)) {
        return NextResponse.json(
          { error: "Leave type must be one of: " + LEAVE_TYPES.join(", ") },
          { status: 400 }
        );
      }
      leave.leaveType = leaveType;
    }

    await leave.save();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "EDIT_LEAVE",
      details: `Updated leave request (${leave.startDate.toLocaleDateString()} - ${leave.endDate.toLocaleDateString()})`,
    });

    return NextResponse.json({ leave });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Cancel one's own pending leave, or delete any leave as a manager. */
async function deleteLeave(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid leave id" }, { status: 400 });
    }

    const leave = await Leave.findOne({ _id: objectId, companyId });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    const isOwner = leave.userId.toString() === user._id.toString();
    const isManager = ["ceo", "hr", "project_manager"].includes(user.role);

    if (!isOwner && !isManager) {
      return NextResponse.json(
        { error: "You do not have permission to delete this leave" },
        { status: 403 }
      );
    }

    if (isOwner && !isManager && leave.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending leaves can be cancelled" },
        { status: 400 }
      );
    }

    await Leave.findByIdAndDelete(objectId);

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "DELETE_LEAVE",
      details: `Deleted leave request (${leave.startDate.toLocaleDateString()} - ${leave.endDate.toLocaleDateString()})`,
    });

    return NextResponse.json({ message: "Leave deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return decideLeave(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return editOwnLeave(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return deleteLeave(request, context);
}
