import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Payroll, { payrollNetSalary } from "@/models/Payroll";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Bulk-generate a payroll run for a month: one pending record per active
 * employee (seeded from their salary) — skipping anyone already on the run.
 * Payroll numbers are derived, not summed, so no aggregation is needed here.
 */
export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("payroll.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json().catch(() => ({}));
    const month: string = body.month || currentMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json(
        { error: "Month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    const employees = await User.find({
      companyId,
      status: "active",
    })
      .select("fullName email salary")
      .lean();

    const existing = await Payroll.find({ companyId, month })
      .select("userId")
      .lean();
    const existingIds = new Set(existing.map((r) => r.userId.toString()));

    const docs = employees
      .filter((u) => !existingIds.has(u._id.toString()))
      .map((u) => {
        const basic = Number(u.salary) || 0;
        return {
          companyId,
          userId: u._id,
          month,
          basicSalary: basic,
          bonus: 0,
          deduction: 0,
          netSalary: payrollNetSalary(basic, 0, 0),
          paymentStatus: "pending",
          createdBy: actor._id,
        };
      });

    let created = 0;
    if (docs.length > 0) {
      const res = await Payroll.insertMany(docs);
      created = res.length;
    }

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "GENERATE_PAYROLL",
      details: `Generated payroll for ${month}: ${created} new, ${docs.length} total employee(s)`,
    });

    return NextResponse.json({
      month,
      created,
      skipped: employees.length - created,
      totalEmployees: employees.length,
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
