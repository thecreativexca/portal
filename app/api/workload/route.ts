import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Project from "@/models/Project";
import Task from "@/models/Task";
import TimeLog from "@/models/TimeLog";
import { requireAuth, handleApiError } from "@/lib/guards";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("tasks.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Scope users: a specific one, a project team, or the whole company.
    const userQuery: Record<string, any> = {
      companyId,
      status: "active",
    };
    // Employees only ever see their own workload row.
    if (user.role === "employee") {
      userQuery._id = user._id;
    } else if (userId) {
      userQuery._id = userId;
    }
    if (projectId) {
      const project = await Project.findOne({ _id: projectId, companyId }).lean();
      if (project && project.teamMemberIds?.length) {
        userQuery._id = { $in: project.teamMemberIds };
      }
    }

    const users = await User.find(userQuery)
      .select("fullName name email role designation profileImage")
      .sort({ fullName: 1 })
      .lean();
    const userIds = users.map((u: any) => u._id);

    if (!userIds.length) {
      return NextResponse.json({ workload: [] });
    }

    // Load all scoped tasks in one pass.
    const taskQuery: Record<string, any> = {
      companyId,
      assignedTo: { $in: userIds },
    };
    if (projectId) taskQuery.projectId = projectId;

    const tasks = await Task.find(taskQuery).select("status dueDate estimatedHours").lean();
    const scopedTaskIds = tasks.map((t: any) => t._id);

    // Logged minutes per user for the (optional) period / project.
    const timeMatch: Record<string, any> = {
      companyId,
      userId: { $in: userIds },
      endTime: { $ne: null },
    };
    if (projectId && scopedTaskIds.length) timeMatch.taskId = { $in: scopedTaskIds };
    if (from && to) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      timeMatch.startTime = { $gte: fromDate, $lte: toDate };
    }

    const timeRows = await TimeLog.aggregate([
      { $match: timeMatch },
      { $group: { _id: "$userId", total: { $sum: "$durationMinutes" } } },
    ]);
    const loggedMap = new Map<string, number>();
    timeRows.forEach((r) => loggedMap.set(r._id.toString(), r.total || 0));

    // Roll up per user.
    const buckets = new Map<
      string,
      {
        tasksAssigned: number;
        tasksInProgress: number;
        tasksDone: number;
        overdue: number;
        estimatedHours: number;
      }
    >();
    userIds.forEach((id: any) =>
      buckets.set(id.toString(), {
        tasksAssigned: 0,
        tasksInProgress: 0,
        tasksDone: 0,
        overdue: 0,
        estimatedHours: 0,
      })
    );

    const now = Date.now();
    tasks.forEach((t: any) => {
      const b = buckets.get(t.assignedTo.toString());
      if (!b) return;
      b.tasksAssigned += 1;
      if (t.status === "in-progress" || t.status === "review") b.tasksInProgress += 1;
      if (t.status === "done") b.tasksDone += 1;
      if (t.status !== "done" && t.dueDate && new Date(t.dueDate).getTime() < now) {
        b.overdue += 1;
      }
      if (t.estimatedHours) b.estimatedHours += t.estimatedHours;
    });

    const workload = users
      .map((u: any) => {
        const b = buckets.get(u._id.toString())!;
        const loggedMinutes = loggedMap.get(u._id.toString()) || 0;
        const loggedHours = loggedMinutes / 60;
        const utilization =
          b.estimatedHours > 0
            ? Math.round((loggedHours / b.estimatedHours) * 100)
            : null;
        return {
          _id: u._id,
          fullName: u.fullName,
          name: u.name,
          email: u.email,
          role: u.role,
          designation: u.designation,
          ...b,
          loggedMinutes,
          loggedHours: Math.round(loggedHours * 100) / 100,
          utilization,
        };
      })
      // Busiest first: most assigned work, then most logged hours.
      .sort(
        (a: any, b: any) =>
          b.tasksAssigned - a.tasksAssigned || b.loggedMinutes - a.loggedMinutes
      );

    const totals = workload.reduce(
      (acc: any, w: any) => ({
        tasksAssigned: acc.tasksAssigned + w.tasksAssigned,
        tasksDone: acc.tasksDone + w.tasksDone,
        overdue: acc.overdue + w.overdue,
        loggedMinutes: acc.loggedMinutes + w.loggedMinutes,
      }),
      { tasksAssigned: 0, tasksDone: 0, overdue: 0, loggedMinutes: 0 }
    );

    return NextResponse.json({ workload, totals });
  } catch (error) {
    return handleApiError(error);
  }
}
