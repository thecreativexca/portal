import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";
import Leave from "@/models/Leave";
import { requireAuth, handleApiError } from "@/lib/guards";

export async function GET(request: Request) {
  try {
    const { user, companyId } = await requireAuth();
    await dbConnect();

    const userId = user._id;
    const url = new URL(request.url);
    const monthStr = url.searchParams.get("month");

    let startDate: Date, endDate: Date;

    if (monthStr) {
      const [y, m] = monthStr.split("-").map(Number);
      startDate = new Date(y, m - 1, 1);
      endDate = new Date(y, m, 0, 23, 59, 59, 999);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
    }

    const [tasks, leaves] = await Promise.all([
      Task.find({
        companyId,
        assignedTo: userId,
        dueDate: { $gte: startDate, $lte: endDate },
      })
        .populate("projectId", "projectName")
        .select("title dueDate status projectId priority")
        .lean(),
      Leave.find({
        companyId,
        userId,
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
      })
        .select("startDate endDate reason status")
        .lean(),
    ]);

    // Build a map of date -> { tasks, leaves } for the month range.
    interface CalendarEventTask {
      title: string;
      project: string;
      status: string;
      priority: string;
    }
    interface CalendarEventLeave {
      reason: string;
      status: string;
      type: "start" | "end" | "middle";
    }
    const eventMap = new Map<
      string,
      { tasks: CalendarEventTask[]; leaves: CalendarEventLeave[] }
    >();

    // Populate changes projectId from an ObjectId to { title }, so the lean
    // documents are cast to the shape the calendar actually reads.
    const taskRows = tasks as unknown as Array<{
      title: string;
      dueDate: Date;
      status: string;
      priority: string;
      projectId?: { projectName: string } | null;
    }>;

    taskRows.forEach((t) => {
      if (!t.dueDate) return;
      const key = new Date(t.dueDate).toISOString().split("T")[0];
      if (!eventMap.has(key)) eventMap.set(key, { tasks: [], leaves: [] });
      eventMap.get(key)!.tasks.push({
        title: t.title,
        project: t.projectId?.projectName || "—",
        status: t.status,
        priority: t.priority,
      });
    });

    const leaveRows = leaves as unknown as Array<{
      reason: string;
      status: string;
      startDate: Date;
      endDate: Date;
    }>;

    leaveRows.forEach((l) => {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      const current = new Date(start);
      while (current <= end) {
        const key = current.toISOString().split("T")[0];
        if (!eventMap.has(key)) eventMap.set(key, { tasks: [], leaves: [] });
        const type =
          key === start.toISOString().split("T")[0]
            ? "start"
            : key === end.toISOString().split("T")[0]
            ? "end"
            : "middle";
        eventMap.get(key)!.leaves.push({
          reason: l.reason,
          status: l.status,
          type,
        });
        current.setDate(current.getDate() + 1);
      }
    });

    // Convert to sorted array
    const sorted = Array.from(eventMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    return NextResponse.json({
      events: sorted.map(([date, data]) => ({ date, ...data })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
