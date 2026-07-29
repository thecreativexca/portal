import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";
import Leave from "@/models/Leave";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = (session.user as any).id;
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
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const [tasks, leaves] = await Promise.all([
      Task.find({
        assignedTo: userId,
        dueDate: { $gte: startDate, $lte: endDate },
      })
        .populate("projectId", "title")
        .select("title dueDate status projectId priority")
        .lean(),
      Leave.find({
        userId,
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
      })
        .select("startDate endDate reason status")
        .lean(),
    ]);

    // Generate all dates in range
    const events: {
      date: string;
      tasks: { title: string; project: string; status: string; priority: string }[];
      leaves: { reason: string; status: string; type: "start" | "end" | "middle" }[];
    }[] = [];

    const eventMap = new Map<string, { tasks: any[]; leaves: any[] }>();

    tasks.forEach((t: any) => {
      if (!t.dueDate) return;
      const key = new Date(t.dueDate).toISOString().split("T")[0];
      if (!eventMap.has(key)) eventMap.set(key, { tasks: [], leaves: [] });
      eventMap.get(key)!.tasks.push({
        title: t.title,
        project: t.projectId?.title || "—",
        status: t.status,
        priority: t.priority,
      });
    });

    leaves.forEach((l: any) => {
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
        eventMap.get(key)!.leaves.push({ reason: l.reason, status: l.status, type });
        current.setDate(current.getDate() + 1);
      }
    });

    // Convert to sorted array
    const sorted = Array.from(eventMap.entries()).sort(([a], [b]) => a.localeCompare(b));

    return NextResponse.json({
      events: sorted.map(([date, data]) => ({ date, ...data })),
    });
  } catch (error) {
    console.error("Error fetching calendar:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}