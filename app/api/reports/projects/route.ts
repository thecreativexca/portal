import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Project from "@/models/Project";
import Task from "@/models/Task";
import { requireAuth, handleApiError } from "@/lib/guards";

export async function GET() {
  try {
    const { companyId } = await requireAuth("reports.read");
    await dbConnect();

    const projects = await Project.find({ companyId })
      .select("projectName status")
      .lean();

    // Single pass over tasks, grouped by project + status. This drives both the
    // per-project stats (avoiding an N+1 Task.find per project) and the global
    // status distribution.
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const [taskStats, statusDist] = await Promise.all([
      Task.aggregate([
        { $match: { companyId: companyObjectId } },
        {
          $group: {
            _id: { projectId: "$projectId", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]),
      Task.aggregate([
        { $match: { companyId: companyObjectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    // Fold the grouped counts into per-project totals.
    const byProject = new Map<string, { total: number; done: number }>();
    for (const s of taskStats) {
      const pid = s._id?.projectId ? s._id.projectId.toString() : "";
      if (!pid) continue;
      const entry = byProject.get(pid) || { total: 0, done: 0 };
      entry.total += s.count;
      if (s._id?.status === "done") entry.done += s.count;
      byProject.set(pid, entry);
    }

    // Build project stats
    const projectStats = projects.map((p) => {
      const t = byProject.get(p._id.toString()) || { total: 0, done: 0 };
      return {
        _id: p._id,
        projectName: p.projectName,
        status: p.status,
        totalTasks: t.total,
        completedTasks: t.done,
        completionPercent: t.total ? Math.round((t.done / t.total) * 100) : 0,
      };
    });

    const distribution = {
      backlog: 0,
      todo: 0,
      "in-progress": 0,
      review: 0,
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
    return handleApiError(error);
  }
}
