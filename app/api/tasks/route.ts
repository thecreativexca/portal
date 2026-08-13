import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Task, { TASK_STATUSES, TASK_PRIORITIES } from "@/models/Task";
import Project from "@/models/Project";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { notifyUser } from "@/lib/notify";
import { loggedMinutesByTask } from "@/lib/taskTime";
import { validate, reqString, enumValue } from "@/lib/validate";

const LIST_SELECT = "-attachments.data";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("tasks.read");
    await dbConnect();

    const userId = user._id;
    const canViewAll = user.role !== "employee";
    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get("projectId");
    const assignedTo = searchParams.get("userId");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const search = searchParams.get("search");
    const label = searchParams.get("label");
    const overdue = searchParams.get("overdue");

    const query: Record<string, any> = { companyId };

    if (projectId) query.projectId = projectId;
    if (status && TASK_STATUSES.includes(status as any))
      query.status = status;
    if (priority && TASK_PRIORITIES.includes(priority as any))
      query.priority = priority;
    if (label) query.labels = label;
    if (overdue === "true") {
      query.status = { $ne: "done" };
      query.dueDate = { $lte: new Date() };
    }

    // Employees only see tasks assigned to them.
    if (!canViewAll) {
      query.assignedTo = userId;
    } else if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const tasks = await Task.find(query)
      .select(LIST_SELECT)
      .populate("assignedTo", "fullName name email")
      .populate("assignedBy", "fullName name email")
      .populate("projectId", "projectName status")
      .populate("comments.userId", "fullName name email")
      .populate("dependencyTaskIds", "title status priority")
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    // Attach real logged time (completed logs only).
    const timeMap = await loggedMinutesByTask(
      tasks.map((t) => t._id),
      companyId
    );

    const withTime = tasks.map((t: any) => ({
      ...t,
      loggedMinutes: timeMap.get(t._id.toString()) || 0,
    }));

    return NextResponse.json({ tasks: withTime });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("tasks.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const body = await request.json();
    const {
      projectId,
      title,
      description,
      assignedTo,
      priority,
      status,
      startDate,
      dueDate,
      estimatedHours,
      labels,
      dependencyTaskIds,
      billable,
    } = body;

    const err = validate(body, {
      projectId: reqString("Project id"),
      title: reqString("Title"),
      assignedTo: reqString("Assignee id"),
      status: enumValue(TASK_STATUSES, "status"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    // Verify the project belongs to the company.
    const project = await Project.findOne({
      _id: projectId,
      companyId,
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify the assignee is a member of the project.
    const isMember = project.teamMemberIds.some(
      (m: any) => m.toString() === assignedTo
    );
    if (!isMember) {
      return NextResponse.json(
        { error: "Assignee must be a project team member" },
        { status: 400 }
      );
    }

    // And belongs to the same company.
    const assignee = await User.findOne({
      _id: assignedTo,
      companyId,
    }).lean();
    if (!assignee) {
      return NextResponse.json(
        { error: "Assignee not found in your company" },
        { status: 400 }
      );
    }

    // Dependencies must exist and live in the same company + project.
    if (dependencyTaskIds?.length) {
      const deps = await Task.find({
        _id: { $in: dependencyTaskIds },
        companyId,
        projectId,
      }).lean();
      if (deps.length !== dependencyTaskIds.length) {
        return NextResponse.json(
          { error: "One or more dependencies are invalid for this project" },
          { status: 400 }
        );
      }
    }

    const task = await Task.create({
      companyId,
      projectId,
      title,
      description,
      assignedTo,
      assignedBy: user._id,
      priority: priority || "medium",
      status: status || "todo",
      startDate: startDate ? new Date(startDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      estimatedHours:
        estimatedHours !== undefined && estimatedHours !== null
          ? Number(estimatedHours)
          : undefined,
      labels: Array.isArray(labels)
        ? labels.map((l: string) => String(l).trim()).filter(Boolean)
        : [],
      dependencyTaskIds: dependencyTaskIds || [],
      billable: billable !== false,
    });

    const populated = await Task.findById(task._id)
      .select(LIST_SELECT)
      .populate("assignedTo", "fullName name email")
      .populate("assignedBy", "fullName name email")
      .populate("projectId", "projectName")
      .populate("dependencyTaskIds", "title status")
      .lean();

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "TASK_CREATED",
      details: `Created task "${title}" in project "${project.projectName}"`,
      taskId: task._id.toString(),
    });

    if (assignedTo !== user._id.toString()) {
      await notifyUser({
        companyId,
        userId: assignedTo,
        title: "New task assigned",
        message: `You were assigned "${title}" in ${project.projectName}`,
        type: "task",
        link: "/tasks",
      });
    }

    return NextResponse.json({ task: populated }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
