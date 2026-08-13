import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Payroll, {
  PAYROLL_PAYMENT_STATUSES,
  payrollNetSalary,
} from "@/models/Payroll";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { ok, parsePagination, paginationMeta } from "@/lib/api";
import { toObjectId, toObjectIdOrNull } from "@/lib/ids";

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("payroll.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // "YYYY-MM"
    const status = searchParams.get("status");
    const userId = searchParams.get("userId");
    const { page, pageSize, skip } = parsePagination(request.url, 50);

    const match: Record<string, any> = {
      companyId: new mongoose.Types.ObjectId(companyId),
    };
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) match.month = month;
    if (status) match.paymentStatus = status;
    if (userId) {
      const objectId = toObjectIdOrNull(userId);
      if (objectId) match.userId = objectId;
    }

    // Summary computed via aggregation.
    const summaryAgg = await Payroll.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalBasic: { $sum: "$basicSalary" },
          totalBonus: { $sum: "$bonus" },
          totalDeduction: { $sum: "$deduction" },
          totalNet: { $sum: "$netSalary" },
        },
      },
    ]);
    const byStatus = await Payroll.aggregate([
      { $match: match },
      { $group: { _id: "$paymentStatus", total: { $sum: "$netSalary" }, count: { $sum: 1 } } },
    ]);

    const [records, total] = await Promise.all([
      Payroll.find(match)
        .populate("userId", "fullName name email designation employeeId role")
        .populate("createdBy", "fullName name")
        .sort({ month: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Payroll.countDocuments(match),
    ]);

    return ok(
      {
        records,
        summary: summaryAgg[0] || {
          count: 0,
          totalBasic: 0,
          totalBonus: 0,
          totalDeduction: 0,
          totalNet: 0,
        },
        byStatus,
      },
      paginationMeta(total, page, pageSize)
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("payroll.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const { userId, month, basicSalary, bonus, deduction, paymentStatus } = body;

    if (!userId || !month) {
      return NextResponse.json(
        { error: "Employee and month (YYYY-MM) are required" },
        { status: 400 }
      );
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json(
        { error: "Month must be in YYYY-MM format" },
        { status: 400 }
      );
    }
    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
    }
    const employee = await User.findOne({ _id: userObjectId, companyId }).lean();
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found in your company" },
        { status: 400 }
      );
    }

    const basic = Number(basicSalary ?? employee.salary ?? 0) || 0;
    const bonusValue = Number(bonus ?? 0) || 0;
    const deductionValue = Number(deduction ?? 0) || 0;

    if (paymentStatus && !(PAYROLL_PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)) {
      return NextResponse.json(
        { error: `Status must be one of: ${PAYROLL_PAYMENT_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const dup = await Payroll.findOne({ companyId, userId: userObjectId, month }).lean();
    if (dup) {
      return NextResponse.json(
        { error: "A payroll record already exists for this employee and month" },
        { status: 409 }
      );
    }

    const record = await Payroll.create({
      companyId,
      userId: userObjectId,
      month,
      basicSalary: basic,
      bonus: bonusValue,
      deduction: deductionValue,
      netSalary: payrollNetSalary(basic, bonusValue, deductionValue),
      paymentStatus: paymentStatus || "pending",
      paidAt:
        paymentStatus === "paid" ? new Date() : undefined,
      createdBy: actor._id,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_PAYROLL",
      details: `Created payroll for ${employee.fullName} (${month})`,
      notifyUserIds: [userId],
    });

    const populated = await Payroll.findById(record._id)
      .populate("userId", "fullName name email designation employeeId role")
      .lean();

    return NextResponse.json({ record: populated }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
