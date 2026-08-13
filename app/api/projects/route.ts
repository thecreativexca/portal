import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Project, { PROJECT_STATUSES, PROJECT_PRIORITIES } from "@/models/Project";
import User from "@/models/User";
import Client from "@/models/Client";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId, toObjectIdOrNull } from "@/lib/ids";
import {
  computeProjectHealth,
  daysUntilEnd,
  hoursUtilization,
  budgetConsumed,
} from "@/lib/projectHealth";

const SORT_FIELDS = [
  "projectName",
  "projectCode",
  "status",
  "priority",
  "progress",
  "budget",
  "createdAt",
  "updatedAt",
  "endDate",
];

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("projects.read");
    await dbConnect();

    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const { searchParams } = new URL(request.url);
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || "1", 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "12", 10) || 12)
    );
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const clientId = searchParams.get("clientId");
    let sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;
    if (!SORT_FIELDS.includes(sortBy)) sortBy = "createdAt";

    const match: Record<string, any> = { companyId: companyObjectId };

    // Employees only see the projects they are assigned to.
    if (user.role === "employee") {
      match.teamMemberIds = user._id;
    }
    if (status && (PROJECT_STATUSES as readonly string[]).includes(status)) {
      match.status = status;
    }
    if (
      priority &&
      (PROJECT_PRIORITIES as readonly string[]).includes(priority)
    ) {
      match.priority = priority;
    }
    if (clientId && toObjectIdOrNull(clientId)) {
      const client = await Client.findOne({
        _id: clientId,
        companyId,
        deletedAt: null,
      }).lean();
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      match.clientId = toObjectId(clientId);
    }
    if (search) {
      const regex = { $regex: search, $options: "i" };
      match.$or = [{ projectName: regex }, { projectCode: regex }];
    }

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: "clients",
          localField: "clientId",
          foreignField: "_id",
          as: "client",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "teamMemberIds",
          foreignField: "_id",
          as: "teamMemberIds",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "projectManagerId",
          foreignField: "_id",
          as: "projectManagerId",
        },
      },
      {
        $lookup: {
          from: "milestones",
          localField: "_id",
          foreignField: "projectId",
          as: "milestones",
        },
      },
      {
        $lookup: {
          from: "tasks",
          localField: "_id",
          foreignField: "projectId",
          as: "tasks",
        },
      },
      {
        $addFields: {
          client: { $arrayElemAt: ["$client", 0] },
          projectManagerId: { $arrayElemAt: ["$projectManagerId", 0] },
          milestoneSummary: {
            total: { $size: "$milestones" },
            completed: {
              $size: {
                $filter: {
                  input: "$milestones",
                  as: "ms",
                  cond: { $eq: ["$$ms.status", "completed"] },
                },
              },
            },
            overdue: {
              $size: {
                $filter: {
                  input: "$milestones",
                  as: "ms",
                  cond: {
                    $and: [
                      { $ne: ["$$ms.status", "completed"] },
                      { $ne: ["$$ms.dueDate", null] },
                      { $lt: ["$$ms.dueDate", "$$NOW"] },
                    ],
                  },
                },
              },
            },
          },
          taskSummary: {
            total: { $size: "$tasks" },
            done: {
              $size: {
                $filter: {
                  input: "$tasks",
                  as: "t",
                  cond: { $eq: ["$$t.status", "done"] },
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          projectName: 1,
          projectCode: 1,
          description: 1,
          status: 1,
          priority: 1,
          progress: 1,
          budget: 1,
          estimatedHours: 1,
          actualHours: 1,
          startDate: 1,
          endDate: 1,
          createdAt: 1,
          updatedAt: 1,
          client: { _id: 1, clientName: 1 },
          projectManagerId: { _id: 1, fullName: 1, name: 1, email: 1 },
          teamMemberIds: {
            $map: {
              input: "$teamMemberIds",
              as: "m",
              in: {
                _id: "$$m._id",
                fullName: "$$m.fullName",
                name: "$$m.name",
                email: "$$m.email",
                role: "$$m.role",
              },
            },
          },
          milestoneSummary: 1,
          taskSummary: 1,
        },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { [sortBy]: sortOrder } },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
          ],
          summaryRows: [
            {
              $project: {
                _id: 1,
                status: 1,
                endDate: 1,
                progress: 1,
                budget: 1,
                estimatedHours: 1,
                actualHours: 1,
                milestoneOverdue: "$milestoneSummary.overdue",
              },
            },
          ],
        },
      },
    ];

    const [result] = await Project.aggregate(pipeline);
    const total = result?.metadata?.[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const rows: any[] = result?.data ?? [];
    const summaryRows: any[] = result?.summaryRows ?? [];

    // Health + derived values are computed in JS from real aggregation data.
    const projects = rows.map((p: any) => {
      const ms = p.milestoneSummary || { total: 0, completed: 0, overdue: 0 };
      const due = daysUntilEnd(p.endDate);
      const health = computeProjectHealth({
        status: p.status,
        progress: p.progress,
        endDate: p.endDate,
        estimatedHours: p.estimatedHours,
        actualHours: p.actualHours,
        milestoneSummary: ms,
      });
      return {
        ...p,
        health,
        daysUntilEnd: due,
        overdue: ms.overdue > 0 || (due !== null && due < 0),
        budgetConsumed: budgetConsumed(p.budget, p.progress),
        budgetRemaining: p.budget
          ? p.budget - budgetConsumed(p.budget, p.progress)
          : 0,
        hoursUtilizationPct: hoursUtilization(
          p.estimatedHours,
          p.actualHours
        ),
      };
    });

    // Summary tiles computed across ALL matching projects (not just the page).
    const summary = {
      total: summaryRows.length,
      active: 0,
      completed: 0,
      onHold: 0,
      onTrack: 0,
      atRisk: 0,
      delayed: 0,
      overdue: 0,
      budgetTotal: 0,
      hoursEstimated: 0,
      hoursActual: 0,
    };
    for (const p of summaryRows) {
      const health = computeProjectHealth({
        status: p.status,
        progress: p.progress,
        endDate: p.endDate,
        estimatedHours: p.estimatedHours,
        actualHours: p.actualHours,
        milestoneSummary: {
          total: 0,
          completed: 0,
          overdue: p.milestoneOverdue || 0,
        },
      });
      if (health === "on-track") summary.onTrack += 1;
      else if (health === "at-risk") summary.atRisk += 1;
      else if (health === "delayed") summary.delayed += 1;
      else if (health === "completed") summary.completed += 1;
      if (p.status === "active") summary.active += 1;
      else if (p.status === "completed") summary.completed += 1;
      else if (p.status === "on-hold") summary.onHold += 1;
      summary.budgetTotal += p.budget || 0;
      summary.hoursEstimated += p.estimatedHours || 0;
      summary.hoursActual += p.actualHours || 0;
    }
    summary.overdue = summary.delayed;

    return NextResponse.json({
      projects,
      pagination: { page, pageSize, total, totalPages },
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("projects.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const body = await request.json();
    const {
      projectName,
      projectCode,
      description,
      status,
      priority,
      clientId,
      projectManagerId,
      teamMemberIds,
      budget,
      estimatedHours,
      startDate,
      endDate,
    } = body;

    if (!projectName || !String(projectName).trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }
    if (!description || !String(description).trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }
    if (
      status &&
      !(PROJECT_STATUSES as readonly string[]).includes(status)
    ) {
      return NextResponse.json(
        { error: `Status must be one of: ${PROJECT_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (
      priority &&
      !(PROJECT_PRIORITIES as readonly string[]).includes(priority)
    ) {
      return NextResponse.json(
        { error: `Priority must be one of: ${PROJECT_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Client (if provided) must belong to the same company.
    if (clientId) {
      const client = await Client.findOne({
        _id: clientId,
        companyId,
        deletedAt: null,
      }).lean();
      if (!client) {
        return NextResponse.json(
          { error: "Client not found in your company" },
          { status: 400 }
        );
      }
    }

    // Project manager and team members must belong to the same company.
    const userRefs = [...new Set(
      [projectManagerId, ...(Array.isArray(teamMemberIds) ? teamMemberIds : [])].filter(Boolean)
    )];
    if (userRefs.length > 0) {
      const members = await User.countDocuments({
        companyId,
        _id: { $in: userRefs },
      });
      if (members !== userRefs.length) {
        return NextResponse.json(
          { error: "One or more project members were not found in your company" },
          { status: 400 }
        );
      }
    }

    try {
      const project = await Project.create({
        companyId,
        projectName: String(projectName).trim(),
        projectCode: projectCode ? String(projectCode).trim() : undefined,
        description: String(description).trim(),
        status: status || "active",
        priority: priority || "medium",
        createdBy: user._id,
        clientId: clientId || undefined,
        projectManagerId: projectManagerId || undefined,
        teamMemberIds: Array.isArray(teamMemberIds)
          ? [...new Set(teamMemberIds)]
          : [],
        budget:
          budget !== undefined && budget !== null && budget !== ""
            ? Number(budget)
            : undefined,
        estimatedHours:
          estimatedHours !== undefined &&
          estimatedHours !== null &&
          estimatedHours !== ""
            ? Number(estimatedHours)
            : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });

      const populated = await Project.findById(project._id)
        .populate("createdBy", "fullName name email")
        .populate("teamMemberIds", "fullName name email role")
        .populate("projectManagerId", "fullName name email")
        .populate("clientId", "clientName")
        .lean();

      await logActivity({
        userId: user._id.toString(),
        companyId,
        action: "CREATE_PROJECT",
        details: `Created project "${project.projectName}"`,
      });

      return NextResponse.json({ project: populated }, { status: 201 });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return NextResponse.json(
          { error: "A project with this project code already exists" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
