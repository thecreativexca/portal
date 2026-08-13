import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Leave from "@/models/Leave";
import Project from "@/models/Project";
import Task from "@/models/Task";
import Attendance from "@/models/Attendance";
import { requireAuth, handleApiError } from "@/lib/guards";
import { cached } from "@/lib/cache";
import { rateLimitByUser } from "@/lib/rateLimit";

export async function GET() {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString(), "reads");
    await dbConnect();

    const stats = await cached(`stats:${companyId}:${user._id}`, 30, async () => {
      const role = user.role;
      const stats: Record<string, any> = {};

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      if (role === "ceo" || role === "hr") {
        stats.totalEmployees = await User.countDocuments({
          companyId,
          status: "active",
        });
        stats.pendingLeaves = await Leave.countDocuments({
          companyId,
          status: "pending",
        });
        stats.activeProjects = await Project.countDocuments({
          companyId,
          status: "active",
        });
        stats.presentToday = await Attendance.countDocuments({
          companyId,
          date: { $gte: startOfToday, $lte: endOfToday },
          status: { $in: ["present", "half-day"] },
        });
      }

      if (role === "project_manager") {
        stats.activeProjects = await Project.countDocuments({
          companyId,
          status: "active",
        });
        stats.pendingTasks = await Task.countDocuments({
          companyId,
          status: { $in: ["todo", "in-progress"] },
        });
      }

      if (role === "team_lead" || role === "employee") {
        stats.pendingTasks = await Task.countDocuments({
          companyId,
          assignedTo: user._id,
          status: { $in: ["todo", "in-progress"] },
        });
        stats.activeProjects = await Project.countDocuments({
          companyId,
          status: "active",
          teamMemberIds: user._id,
        });
      }

      if (role !== "ceo" && role !== "hr") {
        stats.presentToday = (await Attendance.countDocuments({
          companyId,
          userId: user._id,
          date: { $gte: startOfToday, $lte: endOfToday },
          status: { $in: ["present", "half-day"] },
        })) > 0;
      }

      return stats;
    });

    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
