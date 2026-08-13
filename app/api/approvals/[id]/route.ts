import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Approval, { APPROVAL_STATUSES } from "@/models/Approval";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { decideApproval, canApprove } from "@/lib/approvals";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("approvals.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
    }

    const approval = await Approval.findOne({ _id: objectId, companyId })
      .populate("requestedBy", "fullName name email role")
      .populate("approvedBy", "fullName name email")
      .lean();
    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const isApprover = await canApprove(user);
    const isOwner = approval.requestedBy._id.toString() === user._id.toString();
    if (!isApprover && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ approval, canApprove: isApprover });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Decide a pending request: approve or reject with optional remarks. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("approvals.approve");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
    }

    const body = await request.json();
    const { status, remarks } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }
    if (remarks !== undefined && (typeof remarks !== "string" || remarks.length > 500)) {
      return NextResponse.json(
        { error: "Remarks must be a string of at most 500 characters" },
        { status: 400 }
      );
    }

    const approval = await Approval.findOne({ _id: objectId, companyId });
    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }
    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: "Request has already been " + approval.status },
        { status: 400 }
      );
    }

    await decideApproval({
      approval,
      approverUserId: user._id.toString(),
      approverName: user.fullName || user.name || "Someone",
      status,
      remarks,
    });

    const populated = await Approval.findById(objectId)
      .populate("requestedBy", "fullName name email role")
      .populate("approvedBy", "fullName name email")
      .lean();

    return NextResponse.json({ approval: populated });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Withdraw a pending request (owner only). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("approvals.read");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
    }

    const approval = await Approval.findOne({ _id: objectId, companyId });
    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }
    if (approval.requestedBy.toString() !== user._id.toString()) {
      return NextResponse.json(
        { error: "You can only withdraw your own requests" },
        { status: 403 }
      );
    }
    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending requests can be withdrawn" },
        { status: 400 }
      );
    }

    await Approval.findByIdAndDelete(objectId);

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "WITHDRAW_APPROVAL",
      details: `Withdrew approval request "${approval.title}"`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
