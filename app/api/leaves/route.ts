import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Leave, { LEAVE_TYPES } from "@/models/Leave";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { parsePagination, paginationMeta } from "@/lib/api";
import { validate, reqString, enumValue } from "@/lib/validate";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("leaves.read");
    await dbConnect();

    const userId = user._id;
    const canViewAll =
      user.role === "ceo" ||
      user.role === "hr" ||
      user.role === "project_manager";
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const { page, pageSize, skip } = parsePagination(request.url, 50);

    const query: Record<string, any> = { companyId };

    // Only roles that can view everyone see all; others see only their own.
    if (!canViewAll) {
      query.userId = userId;
    }

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }

    const match: Record<string, any> = {
      companyId: new mongoose.Types.ObjectId(companyId),
    };
    if (query.userId) match.userId = query.userId;

    const [leaves, total, stats] = await Promise.all([
      Leave.find(query)
        .populate("userId", "fullName name email role")
        .populate("approvedBy", "fullName name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Leave.countDocuments(query),
      Leave.aggregate([
        { $match: match },
        {
          $facet: {
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
            byType: [{ $group: { _id: "$leaveType", count: { $sum: 1 } } }],
          },
        },
      ]),
    ]);

    const byStatus: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    const byType: Record<string, number> = {};
    (stats[0]?.byStatus || []).forEach((s: any) => {
      if (s._id in byStatus) byStatus[s._id] = s.count;
    });
    (stats[0]?.byType || []).forEach((t: any) => {
      const key = t._id || "annual";
      byType[key] = (byType[key] || 0) + t.count;
    });

    return NextResponse.json({
      leaves,
      ...paginationMeta(total, page, pageSize),
      stats: { byStatus, byType },
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

    const userId = user._id;
    const body = await request.json();
    const { startDate, endDate, reason, leaveType } = body;

    const err = validate(body, {
      startDate: reqString("Start date"),
      endDate: reqString("End date"),
      reason: reqString("Reason"),
      leaveType: enumValue(LEAVE_TYPES, "leave type"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    if (typeof reason === "string" && reason.length < 10) {
      return NextResponse.json(
        { error: "Reason must be at least 10 characters" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    const leave = await Leave.create({
      companyId,
      userId,
      leaveType: leaveType || "annual",
      startDate: start,
      endDate: end,
      reason,
      status: "pending",
    });

    await logActivity({
      userId: userId.toString(),
      companyId,
      action: "APPLY_LEAVE",
      details: `Applied leave from ${startDate} to ${endDate}`,
    });

    return NextResponse.json({ leave }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
