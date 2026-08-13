/**
 * Performance service.
 *
 * All metrics are derived exclusively from real MongoDB records (attendance,
 * leave, tasks, time logs, projects, company settings, users) for a given
 * company + date range — never from hardcoded numbers. The only constants are
 * the weighted productivity formula itself and a 9-hour fallback workday.
 *
 * `computeUserPerformance` and `computeTeamPerformance` share one pure
 * `computeMetrics` so every formula lives in a single place.
 */
import mongoose from "mongoose";
import dbConnect from "./db";
import User from "@/models/User";
import Settings from "@/models/Settings";
import Attendance from "@/models/Attendance";
import Leave from "@/models/Leave";
import Task from "@/models/Task";
import TimeLog from "@/models/TimeLog";
import Project from "@/models/Project";

/* --------------------------------------------------------------------------
 * Public types
 * ------------------------------------------------------------------------ */

export interface ScoreBreakdown {
  attendance: number;
  completion: number;
  onTime: number;
  utilization: number;
}

export interface PerformanceSummary {
  expectedWorkingDays: number;
  presentDays: number;
  halfDays: number;
  attendancePercentage: number;
  averageWorkingHours: number;
  totalLoggedHours: number;
  overtimeHours: number;
  tasksCompleted: number;
  tasksOverdue: number;
  projectUtilization: number;
  leaveDays: number;
  productivityScore: number;
  scores: ScoreBreakdown;
}

export interface ProjectUtilization {
  projectId: string;
  projectName: string;
  loggedHours: number;
  utilization: number;
}

export interface AttendanceTrendPoint {
  date: string;
  totalHours: number;
  status: string;
}

export interface PerformanceUser {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  departmentId?: string;
  joiningDate: string | null;
  summary: PerformanceSummary;
  projectBreakdown: ProjectUtilization[];
  /** Present on per-user profiles; omitted for the team list. */
  attendanceTrend?: AttendanceTrendPoint[];
}

export interface TeamPerformance {
  members: PerformanceUser[];
  averages: {
    attendancePercentage: number;
    averageWorkingHours: number;
    totalLoggedHours: number;
    projectUtilization: number;
    productivityScore: number;
    leaveDays: number;
  };
  range: { from: string; to: string };
}

/* --------------------------------------------------------------------------
 * Pure date / math helpers
 * ------------------------------------------------------------------------ */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Local `YYYY-MM-DD` key (manual padding — never toISOString, which is UTC). */
export function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function clampPct(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Standard workday length in hours from Settings.workingHours ("HH:MM").
 * Falls back to 9 when the value is missing or unparseable.
 */
export function standardHoursPerDay(
  workingHours?: { start?: string; end?: string } | null
): number {
  const parse = (t?: string): number | null => {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = parse(workingHours?.start);
  const end = parse(workingHours?.end);
  if (start === null || end === null) return 9;
  const hours = (end - start) / 60;
  return hours > 0 ? hours : 9;
}

/** Local day keys covered by approved leaves within [from, to]. */
export function approvedLeaveDayKeys(
  leaves: Array<{ startDate: Date; endDate: Date; status: string }>,
  from: Date,
  to: Date
): Set<string> {
  const keys = new Set<string>();
  for (const leave of leaves) {
    if (leave.status !== "approved") continue;
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    const first = start.getTime() > from.getTime() ? startOfDay(start) : from;
    const last = end.getTime() < to.getTime() ? end : to;
    const cursor = new Date(first);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= last.getTime()) {
      keys.add(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return keys;
}

/**
 * Working days in [from, to] matching Settings.workingDays (weekday names),
 * excluding approved-leave days and any days before the user's joining date.
 */
export function expectedWorkingDays(opts: {
  from: Date;
  to: Date;
  workingDays?: string[];
  leaveDayKeys: Set<string>;
  joiningDate?: Date | null;
}): number {
  const { from, to, leaveDayKeys, joiningDate } = opts;
  const normalized = (opts.workingDays && opts.workingDays.length
    ? opts.workingDays
    : ["monday", "tuesday", "wednesday", "thursday", "friday"]
  ).map((w) => w.trim().toLowerCase());

  const start =
    joiningDate && joiningDate.getTime() > from.getTime()
      ? startOfDay(joiningDate)
      : startOfDay(from);
  const end = endOfDay(to);

  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const weekday = cursor
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    if (normalized.includes(weekday) && !leaveDayKeys.has(toDateKey(cursor))) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/* --------------------------------------------------------------------------
 * Metrics
 * ------------------------------------------------------------------------ */

interface Range {
  from: Date;
  to: Date;
  endOfToday: Date;
}

interface MetricsInput {
  fullName: string;
  email: string;
  role: string;
  departmentId?: string;
  joiningDate?: Date | null;
  settings: { workingHours?: { start?: string; end?: string }; workingDays?: string[] } | null;
  attendance: Array<{ date: Date; status: string; totalHours?: number; overtimeHours?: number; checkOut?: Date | null }>;
  leaves: Array<{ startDate: Date; endDate: Date; status: string }>;
  tasks: Array<{ _id: mongoose.Types.ObjectId | string; projectId?: mongoose.Types.ObjectId | string | null; status: string; dueDate?: Date | null; updatedAt?: Date | null }>;
  /** taskId (string) -> total logged minutes for this user in range. */
  timeLogMinutesByTask: Map<string, number>;
  /** taskId (string) -> projectId (string). */
  taskProjectMap: Map<string, string>;
  /** projectId (string) -> projectName. */
  projectNameById: Map<string, string>;
  range: Range;
  includeTrend: boolean;
}

function computeMetrics(input: MetricsInput): PerformanceUser {
  const {
    fullName,
    email,
    role,
    departmentId,
    joiningDate,
    settings,
    attendance,
    leaves,
    tasks,
    timeLogMinutesByTask,
    taskProjectMap,
    projectNameById,
    range,
    includeTrend,
  } = input;

  const stdH = standardHoursPerDay(settings?.workingHours);
  const leaveDayKeys = approvedLeaveDayKeys(leaves, range.from, range.to);
  const expectedDays = expectedWorkingDays({
    from: range.from,
    to: range.to,
    workingDays: settings?.workingDays,
    leaveDayKeys,
    joiningDate,
  });

  // Attendance
  const presentDays = attendance.filter((r) => r.status === "present").length;
  const halfDays = attendance.filter((r) => r.status === "half-day").length;
  const attendancePercentage = clampPct(
    ((presentDays + halfDays) / Math.max(1, expectedDays)) * 100
  );

  const completedRecords = attendance.filter(
    (r) => r.checkOut || (r.totalHours ?? 0) > 0
  );
  const averageWorkingHours = completedRecords.length
    ? round2(
        completedRecords.reduce((s, r) => s + (r.totalHours || 0), 0) /
          completedRecords.length
      )
    : 0;
  const overtimeHours = round2(
    attendance.reduce((s, r) => s + (r.overtimeHours || 0), 0)
  );

  // Logged time
  const totalLoggedMinutes = Array.from(timeLogMinutesByTask.values()).reduce(
    (s, m) => s + m,
    0
  );
  const totalLoggedHours = round2(totalLoggedMinutes / 60);

  // Tasks
  const tasksCompleted = tasks.filter(
    (t) =>
      t.status === "done" &&
      t.updatedAt &&
      t.updatedAt.getTime() >= range.from.getTime() &&
      t.updatedAt.getTime() <= range.to.getTime()
  ).length;
  const tasksOverdue = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate.getTime() < range.endOfToday.getTime()
  ).length;

  // Project utilization
  const availableHours = expectedDays * stdH;
  const projectUtilization = clampPct(
    (totalLoggedHours / Math.max(1, availableHours)) * 100
  );

  const projectMinutes = new Map<string, number>();
  timeLogMinutesByTask.forEach((minutes, taskId) => {
    const projectId = taskProjectMap.get(taskId);
    if (!projectId) return;
    projectMinutes.set(projectId, (projectMinutes.get(projectId) || 0) + minutes);
  });
  const projectBreakdown: ProjectUtilization[] = Array.from(
    projectMinutes.entries()
  )
    .map(([projectId, minutes]) => {
      const loggedHours = round2(minutes / 60);
      return {
        projectId,
        projectName: projectNameById.get(projectId) || "—",
        loggedHours,
        utilization: clampPct((loggedHours / Math.max(1, availableHours)) * 100),
      };
    })
    .sort((a, b) => b.loggedHours - a.loggedHours);

  // Leave days (unique approved days, overlaps not double counted)
  const leaveDays = leaveDayKeys.size;

  // Sub-scores
  const attendanceScore = attendancePercentage;
  const doneAndOverdue = tasksCompleted + tasksOverdue;
  const completionScore =
    doneAndOverdue === 0 ? 100 : (tasksCompleted / doneAndOverdue) * 100;

  const doneWithDueDate = tasks.filter(
    (t) => t.status === "done" && t.dueDate
  );
  let onTimeScore = 100;
  if (doneWithDueDate.length > 0) {
    const onTime = doneWithDueDate.filter(
      (t) => t.updatedAt && t.updatedAt.getTime() <= t.dueDate!.getTime()
    ).length;
    onTimeScore = (onTime / doneWithDueDate.length) * 100;
  }
  const utilizationScore = projectUtilization;

  const productivityScore = Math.round(
    clampPct(
      0.3 * attendanceScore +
        0.3 * completionScore +
        0.2 * onTimeScore +
        0.2 * utilizationScore
    )
  );

  const summary: PerformanceSummary = {
    expectedWorkingDays: expectedDays,
    presentDays,
    halfDays,
    attendancePercentage: round1(attendancePercentage),
    averageWorkingHours,
    totalLoggedHours,
    overtimeHours,
    tasksCompleted,
    tasksOverdue,
    projectUtilization: round1(projectUtilization),
    leaveDays,
    productivityScore,
    scores: {
      attendance: round1(attendanceScore),
      completion: round1(completionScore),
      onTime: round1(onTimeScore),
      utilization: round1(utilizationScore),
    },
  };

  const result: PerformanceUser = {
    userId: "",
    fullName,
    email,
    role,
    departmentId,
    joiningDate: joiningDate ? toDateKey(joiningDate) : null,
    summary,
    projectBreakdown,
  };

  if (includeTrend) {
    result.attendanceTrend = attendance
      .map((r) => ({
        date: toDateKey(new Date(r.date)),
        totalHours: round2(r.totalHours || 0),
        status: r.status,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return result;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* --------------------------------------------------------------------------
 * Async entry points
 * ------------------------------------------------------------------------ */

/**
 * Compute one employee's performance. Returns null when the user does not
 * exist (callers map this to a 404).
 */
export async function computeUserPerformance(input: {
  companyId: string;
  userId: string;
  from: Date;
  to: Date;
}): Promise<PerformanceUser | null> {
  await dbConnect();
  const range: Range = {
    from: startOfDay(input.from),
    to: endOfDay(input.to),
    endOfToday: endOfDay(new Date()),
  };
  const companyId = new mongoose.Types.ObjectId(input.companyId);
  const userId = new mongoose.Types.ObjectId(input.userId);

  const [user, settings, leaves, attendance] = await Promise.all([
    User.findById(userId)
      .select("fullName name email role departmentId joiningDate")
      .lean(),
    Settings.findOne({ companyId }).lean(),
    Leave.find({
      companyId,
      userId,
      status: "approved",
      startDate: { $lte: range.to },
      endDate: { $gte: range.from },
    })
      .select("startDate endDate status")
      .lean(),
    Attendance.find({
      companyId,
      userId,
      date: { $gte: range.from, $lte: range.to },
    })
      .select("date status totalHours overtimeHours checkOut")
      .lean(),
  ]);

  if (!user) return null;

  const tasks = await Task.find({ companyId, assignedTo: userId })
    .select("status dueDate updatedAt projectId")
    .lean();

  const timeRows = await TimeLog.aggregate([
    {
      $match: {
        companyId,
        userId,
        endTime: { $ne: null },
        startTime: { $gte: range.from, $lte: range.to },
      },
    },
    { $group: { _id: "$taskId", minutes: { $sum: "$durationMinutes" } } },
  ]);

  const { timeLogMinutesByTask, taskProjectMap, projectNameById } =
    await buildMaps(tasks as any[], timeRows as any[], companyId);

  const perf = computeMetrics({
    fullName: user.fullName || user.name || "Employee",
    email: user.email || "",
    role: user.role || "employee",
    departmentId: user.departmentId ? user.departmentId.toString() : undefined,
    joiningDate: user.joiningDate || null,
    settings: settings as any,
    attendance: attendance as any[],
    leaves: leaves as any[],
    tasks: tasks as any[],
    timeLogMinutesByTask,
    taskProjectMap,
    projectNameById,
    range,
    includeTrend: true,
  });
  perf.userId = userId.toString();
  return perf;
}

/** Compute performance for every active employee, batched (no N+1). */
export async function computeTeamPerformance(input: {
  companyId: string;
  from: Date;
  to: Date;
}): Promise<TeamPerformance | null> {
  await dbConnect();
  const range: Range = {
    from: startOfDay(input.from),
    to: endOfDay(input.to),
    endOfToday: endOfDay(new Date()),
  };
  const companyId = new mongoose.Types.ObjectId(input.companyId);

  const [users, settings, leaves, attendance, tasks, timeRows] =
    await Promise.all([
      User.find({ companyId, status: "active" })
        .select("fullName name email role departmentId joiningDate")
        .lean(),
      Settings.findOne({ companyId }).lean(),
      Leave.find({
        companyId,
        status: "approved",
        startDate: { $lte: range.to },
        endDate: { $gte: range.from },
      })
        .select("userId startDate endDate status")
        .lean(),
      Attendance.find({ companyId, date: { $gte: range.from, $lte: range.to } })
        .select("userId date status totalHours overtimeHours checkOut")
        .lean(),
      Task.find({ companyId })
        .select("assignedTo status dueDate updatedAt projectId")
        .lean(),
      TimeLog.aggregate([
        {
          $match: {
            companyId,
            endTime: { $ne: null },
            startTime: { $gte: range.from, $lte: range.to },
          },
        },
        {
          $group: {
            _id: { userId: "$userId", taskId: "$taskId" },
            minutes: { $sum: "$durationMinutes" },
          },
        },
      ]),
    ]);

  // taskId -> projectId, projectId -> projectName (shared by all members)
  const taskProjectMap = new Map<string, string>();
  const projectIds = new Set<string>();
  (tasks as any[]).forEach((t) => {
    if (t.projectId) {
      const pid = t.projectId.toString();
      taskProjectMap.set(t._id.toString(), pid);
      projectIds.add(pid);
    }
  });
  const projectNameById = new Map<string, string>();
  if (projectIds.size) {
    const projects = await Project.find({
      _id: { $in: Array.from(projectIds) },
      companyId,
    })
      .select("projectName")
      .lean();
    (projects as any[]).forEach((p) =>
      projectNameById.set(p._id.toString(), p.projectName)
    );
  }

  // Index rows by user id
  const attendanceByUser = groupBy((attendance as any[]), (r) =>
    r.userId.toString()
  );
  const leavesByUser = groupBy(leaves as any[], (r) => r.userId.toString());
  const tasksByUser = groupBy(tasks as any[], (r) =>
    (r.assignedTo ? r.assignedTo.toString() : "_none")
  );
  const minutesByUserTask = new Map<string, Map<string, number>>();
  (timeRows as any[]).forEach((row) => {
    const userId = row._id.userId.toString();
    const taskId = row._id.taskId.toString();
    if (!minutesByUserTask.has(userId))
      minutesByUserTask.set(userId, new Map());
    minutesByUserTask.get(userId)!.set(taskId, row.minutes || 0);
  });

  const members: PerformanceUser[] = (users as any[]).map((u) => {
    const perf = computeMetrics({
      fullName: u.fullName || u.name || "Employee",
      email: u.email || "",
      role: u.role || "employee",
      departmentId: u.departmentId ? u.departmentId.toString() : undefined,
      joiningDate: u.joiningDate || null,
      settings: settings as any,
      attendance: attendanceByUser.get(u._id.toString()) || [],
      leaves: leavesByUser.get(u._id.toString()) || [],
      tasks: tasksByUser.get(u._id.toString()) || [],
      timeLogMinutesByTask: minutesByUserTask.get(u._id.toString()) || new Map(),
      taskProjectMap,
      projectNameById,
      range,
      includeTrend: false,
    });
    perf.userId = u._id.toString();
    return perf;
  });

  members.sort((a, b) => b.summary.productivityScore - a.summary.productivityScore);

  const n = members.length || 1;
  const avg = (key: keyof PerformanceSummary) =>
    round1(members.reduce((s, m) => s + (m.summary[key] as number), 0) / n);

  return {
    members,
    averages: {
      attendancePercentage: avg("attendancePercentage"),
      averageWorkingHours: round2(
        members.reduce((s, m) => s + m.summary.averageWorkingHours, 0) / n
      ),
      totalLoggedHours: round2(
        members.reduce((s, m) => s + m.summary.totalLoggedHours, 0) / n
      ),
      projectUtilization: avg("projectUtilization"),
      productivityScore: avg("productivityScore"),
      leaveDays: round1(members.reduce((s, m) => s + m.summary.leaveDays, 0) / n),
    },
    range: { from: toDateKey(range.from), to: toDateKey(range.to) },
  };
}

/* --------------------------------------------------------------------------
 * Small shared helpers
 * ------------------------------------------------------------------------ */

function buildMaps(
  tasks: Array<{ _id: mongoose.Types.ObjectId; projectId?: mongoose.Types.ObjectId | null }>,
  timeRows: Array<{ _id: mongoose.Types.ObjectId; minutes: number }>,
  companyId: mongoose.Types.ObjectId
): Promise<{
  timeLogMinutesByTask: Map<string, number>;
  taskProjectMap: Map<string, string>;
  projectNameById: Map<string, string>;
}> {
  const timeLogMinutesByTask = new Map<string, number>();
  timeRows.forEach((r) => {
    if (r._id) timeLogMinutesByTask.set(r._id.toString(), r.minutes || 0);
  });

  const taskProjectMap = new Map<string, string>();
  const projectIds = new Set<string>();
  tasks.forEach((t) => {
    if (t.projectId) {
      const pid = t.projectId.toString();
      taskProjectMap.set(t._id.toString(), pid);
      projectIds.add(pid);
    }
  });

  const projectNameById = new Map<string, string>();
  if (projectIds.size) {
    return Project.find({ _id: { $in: Array.from(projectIds) }, companyId })
      .select("projectName")
      .lean()
      .then((projects) => {
        (projects as any[]).forEach((p) =>
          projectNameById.set(p._id.toString(), p.projectName)
        );
        return { timeLogMinutesByTask, taskProjectMap, projectNameById };
      });
  }
  return Promise.resolve({ timeLogMinutesByTask, taskProjectMap, projectNameById });
}

function groupBy<T>(
  rows: T[],
  keyOf: (row: T) => string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  return map;
}
