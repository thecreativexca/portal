import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Client from "@/models/Client";
import Project from "@/models/Project";
import Task from "@/models/Task";
import Attendance from "@/models/Attendance";
import Leave from "@/models/Leave";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import Expense from "@/models/Expense";
import Payroll from "@/models/Payroll";
import ActivityLog from "@/models/ActivityLog";
import { requireRole, handleApiError } from "@/lib/guards";
import { computeTeamPerformance } from "@/lib/performance";
import { cached } from "@/lib/cache";
import { rateLimitByUser } from "@/lib/rateLimit";

/** Local midnight at the start of today. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local end-of-day for today. */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function monthEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

function yearStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

/** Local "YYYY-MM" key for the current calendar month (matches Payroll.month). */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Count documents with an aggregation `$count` stage (no JS-side math). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose models are runtime-checked.
async function countDocs(model: any, match: Record<string, unknown>): Promise<number> {
  const [row] = await model.aggregate([{ $match: match }, { $count: "n" }]);
  return (row?.n as number) || 0;
}

/**
 * CEO executive dashboard — every figure is aggregated live from MongoDB.
 *
 *  - company pulse: employees, attendance, clients, projects, tasks
 *  - finances: revenue, outstanding, expenses, payroll, net profit
 *  - utilization + top performers (reuses the performance service, which is
 *    itself derived exclusively from real attendance/leave/task/time records)
 *  - top revenue clients (payments -> invoices -> clients)
 *  - recent company activity
 */
export async function GET() {
  try {
    const { user, companyId } = await requireRole("ceo", "hr");
    rateLimitByUser(user._id.toString(), "ceoAggregates");
    await dbConnect();

    const data = await cached(`ceo:overview:${companyId}`, 60, async () => {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const monthStartDate = monthStart();
    const monthEndDate = monthEnd();
    const yearStartDate = yearStart();
    const sevenDaysOut = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalEmployees,
      activeEmployees,
      attendanceStatuses,
      onLeaveToday,
      activeClients,
      totalProjects,
      projectHealth,
      tasksDueToday,
      overdueTasks,
      revenueAgg,
      outstandingAgg,
      expensesThisMonth,
      payrollThisMonth,
      topClients,
      activity,
    ] = await Promise.all([
      // Employees
      countDocs(User, { companyId: companyObjectId }),
      countDocs(User, { companyId: companyObjectId, status: "active" }),

      // Attendance today, grouped by status.
      Attendance.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            date: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // Approved leaves covering today.
      countDocs(Leave, {
        companyId: companyObjectId,
        status: "approved",
        startDate: { $lte: todayEnd },
        endDate: { $gte: todayStart },
      }),

      // Active clients (soft-deleted clients excluded).
      countDocs(Client, {
        companyId: companyObjectId,
        status: "active",
        deletedAt: null,
      }),

      // All projects.
      countDocs(Project, { companyId: companyObjectId }),

      // Project health: at-risk vs overdue, derived from dates + milestones +
      // estimated/actual hours — no hardcoded thresholds.
      Project.aggregate([
        { $match: { companyId: companyObjectId, status: { $in: ["active", "on-hold"] } } },
        {
          $lookup: {
            from: "milestones",
            localField: "_id",
            foreignField: "projectId",
            as: "_milestones",
          },
        },
        {
          $addFields: {
            _overdueMilestone: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$_milestones",
                      as: "m",
                      cond: {
                        $and: [
                          { $ne: ["$$m.status", "completed"] },
                          { $ifNull: ["$$m.dueDate", null] },
                          { $lt: ["$$m.dueDate", todayStart] },
                        ],
                      },
                    },
                  },
                },
                0,
              ],
            },
            _endPassed: {
              $and: [
                { $ifNull: ["$endDate", null] },
                { $lt: ["$endDate", todayStart] },
              ],
            },
            _endingSoon: {
              $and: [
                { $ifNull: ["$endDate", null] },
                { $gte: ["$endDate", todayStart] },
                { $lte: ["$endDate", sevenDaysOut] },
                { $lt: [{ $ifNull: ["$progress", 0] }, 100] },
              ],
            },
            _hoursOver: {
              $and: [
                { $ifNull: ["$estimatedHours", null] },
                { $ifNull: ["$actualHours", null] },
                { $gt: ["$actualHours", "$estimatedHours"] },
              ],
            },
          },
        },
        {
          $addFields: {
            _overdue: { $or: ["$_endPassed", "$_overdueMilestone"] },
            _atRisk: { $or: ["$_endingSoon", "$_hoursOver"] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            atRisk: { $sum: { $cond: ["$_atRisk", 1, 0] } },
            overdue: { $sum: { $cond: ["$_overdue", 1, 0] } },
          },
        },
      ]),

      // Tasks due today.
      countDocs(Task, {
        companyId: companyObjectId,
        status: { $nin: ["done"] },
        dueDate: { $gte: todayStart, $lte: todayEnd },
      }),

      // Overdue tasks.
      countDocs(Task, {
        companyId: companyObjectId,
        status: { $nin: ["done"] },
        dueDate: { $lt: todayStart },
      }),

      // Revenue collected this month + this year (cash basis, payment ledger).
      Payment.aggregate([
        { $match: { companyId: companyObjectId, paymentDate: { $gte: yearStartDate } } },
        {
          $group: {
            _id: null,
            thisMonth: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$paymentDate", monthStartDate] },
                      { $lte: ["$paymentDate", monthEndDate] },
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },
            thisYear: { $sum: "$amount" },
          },
        },
      ]),

      // Outstanding (unpaid) invoices: sent invoices with remaining balance.
      Invoice.aggregate([
        { $match: { companyId: companyObjectId, status: "sent" } },
        {
          $addFields: {
            _total: {
              $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }],
            },
          },
        },
        {
          $addFields: {
            _outstanding: {
              $max: [
                0,
                { $subtract: ["$_total", { $ifNull: ["$paidAmount", 0] }] },
              ],
            },
          },
        },
        { $match: { _outstanding: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amount: { $sum: "$_outstanding" },
          },
        },
      ]),

      // Expenses recorded this month.
      Expense.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            date: { $gte: monthStartDate, $lte: monthEndDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),

      // Payroll cost for the current month (paid runs only).
      Payroll.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            month: currentMonthKey(),
            paymentStatus: "paid",
          },
        },
        { $group: { _id: null, total: { $sum: "$netSalary" } } },
      ]),

      // Top revenue clients this year: payments -> invoices -> clients.
      Payment.aggregate([
        { $match: { companyId: companyObjectId, paymentDate: { $gte: yearStartDate } } },
        {
          $lookup: {
            from: "invoices",
            localField: "invoiceId",
            foreignField: "_id",
            as: "_invoice",
          },
        },
        { $unwind: { path: "$_invoice", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "clients",
            localField: "_invoice.clientId",
            foreignField: "_id",
            as: "_client",
          },
        },
        { $unwind: { path: "$_client", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$_client._id",
            clientName: { $first: { $ifNull: ["$_client.clientName", "Unknown"] } },
            revenue: { $sum: "$amount" },
            invoiceCount: { $sum: { $cond: [{ $ifNull: ["$_invoice._id", null] }, 1, 0] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),

      // Recent company-wide activity.
      ActivityLog.aggregate([
        { $match: { companyId: companyObjectId } },
        { $sort: { timestamp: -1 } },
        { $limit: 12 },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "_user",
          },
        },
        { $unwind: { path: "$_user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            action: 1,
            details: 1,
            timestamp: 1,
            userName: { $ifNull: ["$_user.fullName", "Unknown"] },
          },
        },
      ]),
    ]);

    // Map attendance statuses -> today's figures.
    const attMap = new Map(
      attendanceStatuses.map((r) => [r._id, r.count as number])
    );
    const presentToday = (attMap.get("present") || 0) + (attMap.get("half-day") || 0);
    const absentToday = attMap.get("absent") || 0;

    const revenue = revenueAgg[0] || { thisMonth: 0, thisYear: 0 };
    const outstanding = outstandingAgg[0] || { count: 0, amount: 0 };
    const expenses = expensesThisMonth[0]?.total || 0;
    const payroll = payrollThisMonth[0]?.total || 0;
    const health = projectHealth[0] || { total: 0, atRisk: 0, overdue: 0 };

    const revenueThisMonth = revenue.thisMonth || 0;
    const netProfitThisMonth = Math.max(
      0,
      revenueThisMonth - expenses - payroll
    );

    // Utilization + top performers share the performance service's real-data
    // metrics (current month) so the CEO dashboard matches the performance page.
    const team = await computeTeamPerformance({
      companyId,
      from: monthStartDate,
      to: endOfToday(),
    });

    const topPerformingEmployees = (team?.members || [])
      .slice(0, 5)
      .map((m) => ({
        userId: m.userId,
        fullName: m.fullName,
        role: m.role,
        productivityScore: m.summary.productivityScore,
        projectUtilization: m.summary.projectUtilization,
        tasksCompleted: m.summary.tasksCompleted,
        attendancePercentage: m.summary.attendancePercentage,
      }));

      return {
        kpis: {
        totalEmployees,
        activeEmployees,
        presentToday,
        absentToday,
        onLeaveToday,
        activeClients,
        totalProjects,
        projectsAtRisk: health.atRisk,
        projectsOverdue: health.overdue,
        tasksDueToday,
        overdueTasks,
        revenueThisMonth,
        revenueThisYear: revenue.thisYear || 0,
        outstandingAmount: outstanding.amount,
        outstandingCount: outstanding.count,
        expensesThisMonth: expenses,
        payrollThisMonth: payroll,
        netProfitThisMonth,
        averageUtilization: team?.averages?.projectUtilization ?? 0,
      },
      topPerformingEmployees,
      topRevenueClients: topClients.map((c) => ({
        clientId: c._id,
        clientName: c.clientName,
        revenue: c.revenue,
        invoiceCount: c.invoiceCount,
      })),
        recentActivity: activity,
      };
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
