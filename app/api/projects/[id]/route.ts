import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Project, { PROJECT_STATUSES, PROJECT_PRIORITIES } from "@/models/Project";
import Milestone from "@/models/Milestone";
import Task from "@/models/Task";
import User from "@/models/User";
import Client from "@/models/Client";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";
import {
  computeProjectHealth,
  daysUntilEnd,
  hoursUtilization,
  budgetConsumed,
} from "@/lib/projectHealth";

const EDITABLE_FIELDS = [
  "projectName",
  "projectCode",
  "description",
  "status",
  "priority",
  "clientId",
  "projectManagerId",
  "teamMemberIds",
  "budget",
  "estimatedHours",
  "actualHours",
  "startDate",
  "endDate",
  "progress",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("projects.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const project = await Project.findOne({ _id: objectId, companyId })
      .populate("createdBy", "fullName name email")
      .populate("teamMemberIds", "fullName name email role")
      .populate("projectManagerId", "fullName name email")
      .populate("clientId", "clientName")
      .lean();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Live aggregates: milestone + task counts for the summary.
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const [milestoneAgg, taskAgg] = await Promise.all([
      Milestone.aggregate([
        { $match: { companyId: companyObjectId, projectId: objectId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$status", "completed"] },
                      { $ne: ["$dueDate", null] },
                      { $lt: ["$dueDate", "$$NOW"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Task.aggregate([
        { $match: { companyId: companyObjectId, projectId: objectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const ms = milestoneAgg[0] || { total: 0, completed: 0, overdue: 0 };
    const taskCounts: Record<string, number> = {};
    taskAgg.forEach((t: any) => {
      taskCounts[t._id] = t.count;
    });
    const taskSummary = {
      total: taskCounts.todo + taskCounts["in-progress"] + taskCounts.done || 0,
      todo: taskCounts.todo || 0,
      inProgress: taskCounts["in-progress"] || 0,
      done: taskCounts.done || 0,
    };
    const milestoneSummary = {
      total: ms.total || 0,
      completed: ms.completed || 0,
      overdue: ms.overdue || 0,
    };

    const due = daysUntilEnd(project.endDate);
    const health = computeProjectHealth({
      status: project.status,
      progress: project.progress,
      endDate: project.endDate,
      estimatedHours: project.estimatedHours,
      actualHours: project.actualHours,
      milestoneSummary,
    });

    const summary = {
      health,
      daysUntilEnd: due,
      overdue: milestoneSummary.overdue > 0 || (due !== null && due < 0),
      milestoneSummary,
      taskSummary,
      budgetConsumed: budgetConsumed(project.budget, project.progress),
      budgetRemaining: project.budget
        ? project.budget - budgetConsumed(project.budget, project.progress)
        : 0,
      hoursUtilizationPct: hoursUtilization(
        project.estimatedHours,
        project.actualHours
      ),
    };

    return NextResponse.json({ project, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

async function updateProject(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("projects.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const body = await request.json();
    const existing = await Project.findOne({ _id: objectId, companyId });
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (
      body.projectName !== undefined &&
      !String(body.projectName).trim()
    ) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }
    if (
      body.status !== undefined &&
      !(PROJECT_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json(
        { error: `Status must be one of: ${PROJECT_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (
      body.priority !== undefined &&
      !(PROJECT_PRIORITIES as readonly string[]).includes(body.priority)
    ) {
      return NextResponse.json(
        { error: `Priority must be one of: ${PROJECT_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Client (if provided) must belong to the same company.
    if (body.clientId) {
      const client = await Client.findOne({
        _id: body.clientId,
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
    const userRefs = [
      ...new Set(
        [
          body.projectManagerId,
          ...(Array.isArray(body.teamMemberIds)
            ? body.teamMemberIds
            : []),
        ].filter(Boolean)
      ),
    ];
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

    const updateData: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;

      if (
        field === "budget" ||
        field === "estimatedHours" ||
        field === "actualHours"
      ) {
        updateData[field] =
          body[field] === "" || body[field] === null
            ? null
            : Number(body[field]);
        continue;
      }
      if (field === "startDate" || field === "endDate") {
        updateData[field] = body[field] ? new Date(body[field]) : null;
        continue;
      }
      if (field === "teamMemberIds") {
        updateData[field] = [...new Set(body[field])];
        continue;
      }
      if (field === "clientId" || field === "projectManagerId") {
        updateData[field] = body[field] || null;
        continue;
      }
      updateData[field] = body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    try {
      const updated = await Project.findByIdAndUpdate(objectId, updateData, {
        new: true,
        runValidators: true,
      })
        .populate("createdBy", "fullName name email")
        .populate("teamMemberIds", "fullName name email role")
        .populate("projectManagerId", "fullName name email")
        .populate("clientId", "clientName")
        .lean();

      await logActivity({
        userId: user._id.toString(),
        companyId,
        action: "UPDATE_PROJECT",
        details: `Updated project "${updated!.projectName}"`,
      });

      return NextResponse.json({ project: updated });
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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateProject(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateProject(request, context);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth("projects.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const project = await Project.findOne({ _id: objectId, companyId });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Delete the tasks and milestones under this project (scoped to the company).
    await Task.deleteMany({ companyId, projectId: objectId });
    await Milestone.deleteMany({ companyId, projectId: objectId });
    await Project.findByIdAndDelete(objectId);

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "DELETE_PROJECT",
      details: `Deleted project "${project.projectName}" with all tasks and milestones`,
    });

    return NextResponse.json({ message: "Project deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
