import mongoose from "mongoose";
import dbConnect from "./db";
import TimeLog from "@/models/TimeLog";

/**
 * Sum completed time-log minutes grouped by task id.
 * Returns a Map<taskIdString, totalMinutes> so callers can attach the logged
 * time to task records without an extra round-trip per task.
 */
export async function loggedMinutesByTask(
  taskIds: (mongoose.Types.ObjectId | string)[],
  companyId: mongoose.Types.ObjectId | string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!taskIds.length) return map;

  await dbConnect();
  const rows = await TimeLog.aggregate([
    {
      $match: {
        taskId: { $in: taskIds },
        companyId: new mongoose.Types.ObjectId(companyId.toString()),
        endTime: { $ne: null },
      },
    },
    { $group: { _id: "$taskId", total: { $sum: "$durationMinutes" } } },
  ]);

  rows.forEach((r) => {
    map.set(r._id.toString(), r.total || 0);
  });

  return map;
}

/** Total logged minutes for a single task (completed logs only). */
export async function loggedMinutesForTask(
  taskId: mongoose.Types.ObjectId | string,
  companyId: mongoose.Types.ObjectId | string
): Promise<number> {
  const map = await loggedMinutesByTask([taskId], companyId);
  return map.get(taskId.toString()) || 0;
}
