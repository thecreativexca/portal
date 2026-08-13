import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Payment from "@/models/Payment";
import Expense from "@/models/Expense";
import Payroll from "@/models/Payroll";
import { requireAuth, handleApiError } from "@/lib/guards";

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** All calendar months between from/to (inclusive), oldest first. */
function monthRange(from: string, to: string): string[] {
  const keys: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const cursor = new Date(fy, fm - 1, 1);
  const end = new Date(ty, tm - 1, 1);
  while (cursor <= end) {
    keys.push(monthKeyOf(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function rangeFor(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

/**
 * Monthly profit & loss report (cash basis):
 *   revenue  = payments received in the month
 *   expenses = expenses recorded in the month
 *   payroll  = payroll paid out in the month (netSalary of paid runs)
 *   profit   = revenue - expenses - payroll
 *
 * Each line is produced by an aggregation grouped by calendar month.
 */
export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("finance.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const from = searchParams.get("from") || monthKeyOf(defaultFrom);
    const to = searchParams.get("to") || monthKeyOf(now);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(from) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(to)) {
      return NextResponse.json(
        { error: "from and to must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const axis = monthRange(from, to);
    const rangeStart = rangeFor(axis[0]).start;
    const rangeEnd = rangeFor(axis[axis.length - 1]).end;

    const [revenueByMonth, expenseByMonth, payrollByMonth] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            paymentDate: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$paymentDate" } },
            revenue: { $sum: "$amount" },
          },
        },
      ]),
      Expense.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            date: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
            expenses: { $sum: "$amount" },
          },
        },
      ]),
      Payroll.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            month: { $gte: from, $lte: to },
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: "$month",
            payroll: { $sum: "$netSalary" },
          },
        },
      ]),
    ]);

    const revenueMap = new Map(revenueByMonth.map((r: any) => [r._id, r.revenue as number]));
    const expenseMap = new Map(expenseByMonth.map((r: any) => [r._id, r.expenses as number]));
    const payrollMap = new Map(payrollByMonth.map((r: any) => [r._id, r.payroll as number]));

    const series = axis.map((month) => {
      const revenue = revenueMap.get(month) || 0;
      const expenses = expenseMap.get(month) || 0;
      const payroll = payrollMap.get(month) || 0;
      return {
        month,
        revenue,
        expenses,
        payroll,
        profit: revenue - expenses - payroll,
      };
    });

    return NextResponse.json({
      series,
      totals: {
        revenue: series.reduce((s, m) => s + m.revenue, 0),
        expenses: series.reduce((s, m) => s + m.expenses, 0),
        payroll: series.reduce((s, m) => s + m.payroll, 0),
        profit: series.reduce((s, m) => s + m.profit, 0),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
