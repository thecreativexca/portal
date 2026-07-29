import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Project from "@/models/Project";
import Task from "@/models/Task";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ceo") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const projects = await Project.find({})
      .select("title status")
      .lean();

    const taskStats = await Task.aggregate([
      {
        $group: {
          _id: { projectId: "$projectId", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build project stats
    const projectStats = await Promise.all(
      projects.map(async (p: any) => {
        const tasks = await Task.find({ projectId: p._id }).lean();
        const total = tasks.length;
        const done = tasks.filter((t: any) => t.status === "done").length;
        return {
          _id: p._id,
          title: p.title,
          status: p.status,
          totalTasks: total,
          completedTasks: done,
          completionPercent: total ? Math.round((done / total) * 100) : 0,
        };
      })
    );

    // Status distribution across all tasks
    const statusDist = await Task.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const distribution = {
      todo: 0,
      "in-progress": 0,
      done: 0,
    };
    statusDist.forEach((s: any) => {
      if (s._id in distribution) (distribution as any)[s._id] = s.count;
    });

    return NextResponse.json({
      projectStats,
      taskDistribution: distribution,
      totalProjects: projects.length,
    });
  } catch (error) {
    console.error("Error in project report:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}