import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Payment from "@/models/Payment";
import Expense from "@/models/Expense";
import Milestone from "@/models/Milestone";
import User from "@/models/User";
import Client from "@/models/Client";
import { requireRole, handleApiError } from "@/lib/guards";
import { cached } from "@/lib/cache";
import { rateLimitByUser } from "@/lib/rateLimit";

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Build the last N calendar months (oldest first) as "YYYY-MM" keys. */
function recentMonths(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKeyOf(d));
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
 * CEO chart series — every point comes from a MongoDB aggregation:
 *  - monthlyRevenueTrend    cash collected per month (payment ledger)
 *  - expenseTrend           expenses per month
 *  - projectCompletionTrend milestones completed per month
 *  - employeeGrowth         hires per month + running active-employee total
 *  - clientAcquisition      clients created per month (soft-deleted excluded)
 */
export async function GET() {
  try {
    const { user, companyId } = await requireRole("ceo", "hr");
    rateLimitByUser(user._id.toString(), "ceoAggregates");
    await dbConnect();

    const data = await cached(`ceo:charts:${companyId}`, 60, async () => {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const axis = recentMonths(6);
    const rangeStart = rangeFor(axis[0]).start;

    const [revenueByMonth, expenseByMonth, completionByMonth, hiresByMonth, clientsByMonth] =
      await Promise.all([
        Payment.aggregate([
          {
            $match: {
              companyId: companyObjectId,
              paymentDate: { $gte: rangeStart },
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
          { $match: { companyId: companyObjectId, date: { $gte: rangeStart } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
              expenses: { $sum: "$amount" },
            },
          },
        ]),
        Milestone.aggregate([
          {
            $match: {
              companyId: companyObjectId,
              status: "completed",
              completedAt: { $ne: null, $gte: rangeStart },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m", date: "$completedAt" },
              },
              completed: { $sum: 1 },
            },
          },
        ]),
        User.aggregate([
          { $match: { companyId: companyObjectId, createdAt: { $gte: rangeStart } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m", date: "$createdAt" },
              },
              hired: { $sum: 1 },
            },
          },
        ]),
        Client.aggregate([
          {
            $match: {
              companyId: companyObjectId,
              deletedAt: null,
              createdAt: { $gte: rangeStart },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m", date: "$createdAt" },
              },
              acquired: { $sum: 1 },
            },
          },
        ]),
      ]);

    const revenueMap = new Map(revenueByMonth.map((r) => [r._id, r.revenue as number]));
    const expenseMap = new Map(expenseByMonth.map((r) => [r._id, r.expenses as number]));
    const completionMap = new Map(completionByMonth.map((r) => [r._id, r.completed as number]));
    const hiresMap = new Map(hiresByMonth.map((r) => [r._id, r.hired as number]));
    const clientsMap = new Map(clientsByMonth.map((r) => [r._id, r.acquired as number]));

    let runningEmployees = 0;
    const employeeGrowth = axis.map((month) => {
      const hired = hiresMap.get(month) || 0;
      runningEmployees += hired;
      return { month, hired, total: runningEmployees };
    });

      return {
        monthlyRevenueTrend: axis.map((month) => ({
          month,
          revenue: revenueMap.get(month) || 0,
        })),
        expenseTrend: axis.map((month) => ({
          month,
          expenses: expenseMap.get(month) || 0,
        })),
        projectCompletionTrend: axis.map((month) => ({
          month,
          completed: completionMap.get(month) || 0,
        })),
        employeeGrowth,
        clientAcquisition: axis.map((month) => ({
          month,
          acquired: clientsMap.get(month) || 0,
        })),
      };
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
