import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Approval, { APPROVAL_TYPES } from "@/models/Approval";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { createApprovalRequest, canApprove } from "@/lib/approvals";
import { validate, reqString, enumValue } from "@/lib/validate";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("approvals.read");
    await dbConnect();

    const isApprover = await canApprove(user);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const mine = searchParams.get("mine");
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);

    const query: Record<string, any> = { companyId };

    // Approvers see the whole queue; everyone else sees only their own.
    if (!isApprover) {
      query.requestedBy = user._id;
    } else if (mine === "true") {
      query.requestedBy = user._id;
    }

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }
    if (type && (APPROVAL_TYPES as readonly string[]).includes(type)) {
      query.type = type;
    }

    const skip = (page - 1) * limit;

    const [approvals, total, stats] = await Promise.all([
      Approval.find(query)
        .populate("requestedBy", "fullName name email role")
        .populate("approvedBy", "fullName name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Approval.countDocuments(query),
      Approval.aggregate([
        {
          $match: {
            companyId: new mongoose.Types.ObjectId(companyId),
            ...(isApprover ? {} : { requestedBy: user._id }),
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const byStatus: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    stats.forEach((s) => {
      if (s._id in byStatus) byStatus[s._id] = s.count;
    });

    return NextResponse.json({
      approvals,
      canApprove: isApprover,
      stats: byStatus,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
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
    const { type, entityId, title, description, link } = body;

    const err = validate(body, {
      title: reqString("Title"),
      type: enumValue(APPROVAL_TYPES, "type"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const { approval } = await createApprovalRequest({
      companyId,
      userId: user._id.toString(),
      type: type || "general",
      entityId,
      title: title.trim(),
      description,
      link,
    });

    return NextResponse.json({ approval }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
