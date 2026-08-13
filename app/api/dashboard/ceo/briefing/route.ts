import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Project from "@/models/Project";
import Task from "@/models/Task";
import Milestone from "@/models/Milestone";
import Attendance from "@/models/Attendance";
import Leave from "@/models/Leave";
import Invoice from "@/models/Invoice";
import Lead from "@/models/Lead";
import { requireRole, handleApiError } from "@/lib/guards";
import { cached } from "@/lib/cache";
import { rateLimitByUser } from "@/lib/rateLimit";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * CEO morning briefing — the items that need attention right now. Every list is
 * derived live from MongoDB:
 *  - delayed projects     end date passed or overdue milestone
 *  - overdue invoices     due before today with an outstanding balance
 *  - absent employees     active staff with no present attendance today (and
 *                          not on approved leave)
 *  - upcoming deadlines    tasks & milestones due within the next 7 days
 *  - new leads            leads created in the last 7 days
 *  - pending approvals    leave requests awaiting a decision
 */
export async function GET() {
  try {
    const { user, companyId } = await requireRole("ceo", "hr");
    rateLimitByUser(user._id.toString(), "ceoAggregates");
    await dbConnect();

    const data = await cached(`ceo:briefing:${companyId}`, 60, async () => {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const sevenDaysOut = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      delayedProjects,
      overdueInvoices,
      presentIds,
      leaveIds,
      activeUsers,
      tasksDueSoon,
      milestonesDueSoon,
      newLeads,
      pendingLeaves,
    ] = await Promise.all([
      // Projects running past their end date or with an overdue milestone.
      Project.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            status: { $in: ["active", "on-hold"] },
          },
        },
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
            _overdueMilestoneCount: {
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
            _daysOverdue: {
              $cond: [
                { $ifNull: ["$endDate", null] },
                {
                  $ceil: {
                    $divide: [
                      { $subtract: [todayStart, "$endDate"] },
                      86400000,
                    ],
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $match: {
            $or: [
              { _overdueMilestoneCount: { $gt: 0 } },
              // _daysOverdue is 0 when endDate is missing (see $addFields).
              { _daysOverdue: { $gt: 0 } },
            ],
          },
        },
        {
          $project: {
            _id: 1,
            projectName: 1,
            status: 1,
            endDate: 1,
            overdueMilestones: "$_overdueMilestoneCount",
          },
        },
        { $sort: { _daysOverdue: -1 } },
        { $limit: 8 },
      ]),

      // Overdue invoices (due before today with an outstanding balance).
      Invoice.aggregate([
        { $match: { companyId: companyObjectId, status: "sent" } },
        {
          $addFields: {
            _total: {
              $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }],
            },
            _daysOverdue: {
              $ceil: {
                $divide: [{ $subtract: [todayStart, "$dueDate"] }, 86400000],
              },
            },
          },
        },
        {
          $addFields: {
            outstanding: {
              $max: [
                0,
                { $subtract: ["$_total", { $ifNull: ["$paidAmount", 0] }] },
              ],
            },
          },
        },
        {
          $match: {
            dueDate: { $ne: null, $lt: todayStart },
            outstanding: { $gt: 0 },
          },
        },
        {
          $lookup: {
            from: "clients",
            localField: "clientId",
            foreignField: "_id",
            as: "_client",
          },
        },
        { $unwind: { path: "$_client", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            invoiceNumber: 1,
            outstanding: 1,
            dueDate: 1,
            clientName: { $ifNull: ["$_client.clientName", "Unknown"] },
          },
        },
        { $sort: { _daysOverdue: -1 } },
        { $limit: 8 },
      ]),

      // Users present (or half-day) today -> used to derive who is absent.
      Attendance.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            date: { $gte: todayStart, $lte: todayEnd },
            status: { $in: ["present", "half-day"] },
          },
        },
        { $group: { _id: "$userId" } },
      ]),

      // Users on approved leave covering today.
      Leave.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            status: "approved",
            startDate: { $lte: todayEnd },
            endDate: { $gte: todayStart },
          },
        },
        { $group: { _id: "$userId" } },
      ]),

      // Active staff roster (to compute absences).
      User.find({ companyId: companyObjectId, status: "active" })
        .select("fullName role designation profileImage")
        .lean(),

      // Tasks due within the next 7 days (not done).
      Task.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            status: { $nin: ["done"] },
            dueDate: { $gte: todayStart, $lte: sevenDaysOut },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "assignedTo",
            foreignField: "_id",
            as: "_assignee",
          },
        },
        { $unwind: { path: "$_assignee", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "projects",
            localField: "projectId",
            foreignField: "_id",
            as: "_project",
          },
        },
        { $unwind: { path: "$_project", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1,
            dueDate: 1,
            priority: 1,
            assigneeName: { $ifNull: ["$_assignee.fullName", "Unassigned"] },
            projectName: { $ifNull: ["$_project.projectName", null] },
          },
        },
        { $sort: { dueDate: 1 } },
        { $limit: 10 },
      ]),

      // Milestones due within the next 7 days (not completed).
      Milestone.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            status: { $ne: "completed" },
            dueDate: { $gte: todayStart, $lte: sevenDaysOut },
          },
        },
        {
          $lookup: {
            from: "projects",
            localField: "projectId",
            foreignField: "_id",
            as: "_project",
          },
        },
        { $unwind: { path: "$_project", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1,
            dueDate: 1,
            projectName: { $ifNull: ["$_project.projectName", "Unknown"] },
          },
        },
        { $sort: { dueDate: 1 } },
        { $limit: 8 },
      ]),

      // Leads created in the last 7 days.
      Lead.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            deletedAt: null,
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        {
          $project: {
            _id: 1,
            companyName: 1,
            estimatedValue: 1,
            stage: 1,
            createdAt: 1,
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
      ]),

      // Leave requests awaiting approval.
      Leave.aggregate([
        { $match: { companyId: companyObjectId, status: "pending" } },
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
            leaveType: 1,
            startDate: 1,
            endDate: 1,
            reason: 1,
            userName: { $ifNull: ["$_user.fullName", "Unknown"] },
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
      ]),
    ]);

    // Absent employees = active staff who are neither present today nor on leave.
    const presentSet = new Set(presentIds.map((r) => r._id.toString()));
    const leaveSet = new Set(leaveIds.map((r) => r._id.toString()));
    const absent = activeUsers
      .filter(
        (u) => !presentSet.has(u._id.toString()) && !leaveSet.has(u._id.toString())
      )
      .map((u) => ({
        _id: u._id,
        fullName: u.fullName,
        role: u.role,
        designation: u.designation || null,
        profileImage: u.profileImage || null,
      }));

      return {
        delayedProjects: delayedProjects.map((p) => ({
          _id: p._id,
          projectName: p.projectName,
          status: p.status,
          endDate: p.endDate || null,
          overdueMilestones: p.overdueMilestones || 0,
        })),
        overdueInvoices: overdueInvoices.map((i) => ({
          _id: i._id,
          invoiceNumber: i.invoiceNumber,
          clientName: i.clientName,
          outstanding: i.outstanding,
          dueDate: i.dueDate || null,
        })),
        absentEmployees: absent.slice(0, 10),
        upcomingDeadlines: {
          tasks: tasksDueSoon,
          milestones: milestonesDueSoon,
        },
        newLeads,
        pendingApprovals: pendingLeaves,
      };
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
