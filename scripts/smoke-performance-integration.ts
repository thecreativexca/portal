/**
 * Integration test: insert controlled records into the DB, compute
 * performance, assert every metric against hand-computed expectations, then
 * clean up. Read/write on the dev DB but fully reversible.
 *
 * The test user acts as its own isolated "company" (companyId = user's own id)
 * so nothing depends on the real company's settings/users.
 *
 * Usage: npx tsx scripts/smoke-performance-integration.ts
 */
import mongoose from "mongoose";

const TEST_EMAIL = `perf-test-${Date.now()}@test.local`;

async function main() {
  const fs = await import("fs");
  const path = await import("path");
  const envPath = path.resolve(__dirname, "../.env.local");
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1).trim();
  }

  const { default: dbConnect } = await import("../lib/db");
  const { default: User } = await import("../models/User");
  const { default: Settings } = await import("../models/Settings");
  const { default: Attendance } = await import("../models/Attendance");
  const { default: Leave } = await import("../models/Leave");
  const { default: Task } = await import("../models/Task");
  const { default: TimeLog } = await import("../models/TimeLog");
  const { default: Project } = await import("../models/Project");
  const { computeUserPerformance, startOfDay, endOfDay } = await import("../lib/performance");

  await dbConnect();

  const created = {
    userId: "",
    attendanceIds: [] as string[],
    taskIds: [] as string[],
    timeLogIds: [] as string[],
    projectId: "",
  };

  const doCleanup = async () => {
    if (created.userId) {
      await User.deleteMany({ email: TEST_EMAIL });
      await Attendance.deleteMany({ _id: { $in: created.attendanceIds } });
      await Leave.deleteMany({ userId: created.userId });
      await Task.deleteMany({ _id: { $in: created.taskIds } });
      await TimeLog.deleteMany({ _id: { $in: created.timeLogIds } });
      if (created.projectId) await Project.deleteMany({ _id: created.projectId });
      await Settings.deleteMany({ companyId: created.userId });
    }
  };

  try {
    const placeholder = new mongoose.Types.ObjectId();
    const testUser = await User.create({
      companyId: placeholder,
      fullName: "Perf Test User",
      name: "Perf Test User",
      email: TEST_EMAIL,
      password: "password123",
      role: "employee",
      joiningDate: new Date(2026, 0, 15),
      status: "active",
    });
    const uid = testUser._id;
    created.userId = uid.toString();
    // Isolated company = the test user's own id.
    await User.updateOne({ _id: uid }, { $set: { companyId: uid } });
    const companyId = uid.toString();

    await Settings.create({
      companyId: uid,
      companyName: "Test Co",
      workingHours: { start: "09:00", end: "18:00" },
      workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    });

    const project = await Project.create({
      companyId: uid,
      projectName: "Test Project",
      description: "Integration test project",
      status: "active",
      createdBy: uid,
      teamMemberIds: [uid],
    });
    created.projectId = project._id.toString();

    const mkAttendance = async (
      day: number,
      status: "present" | "half-day" | "absent",
      hours: number,
      overtime: number
    ) => {
      const rec = await Attendance.create({
        companyId: uid,
        userId: uid,
        date: new Date(2026, 7, day),
        checkIn: new Date(2026, 7, day, 9, 0),
        checkOut: new Date(2026, 7, day, 9 + hours, 0),
        totalHours: hours,
        overtimeHours: overtime,
        status,
      });
      created.attendanceIds.push(rec._id.toString());
    };
    // Range Mon Aug 3 -> Sun Aug 9. Approved leave Wed Aug 5.
    await mkAttendance(3, "present", 10, 1); // overtime
    await mkAttendance(4, "present", 9, 0);
    await mkAttendance(6, "present", 9, 0);
    await mkAttendance(7, "half-day", 3, 0);

    await Leave.create({
      companyId: uid,
      userId: uid,
      leaveType: "annual",
      startDate: new Date(2026, 7, 5),
      endDate: new Date(2026, 7, 5),
      reason: "Integration test leave",
      status: "approved",
    });

    const mkTask = async (
      title: string,
      status: "done" | "backlog" | "todo" | "in-progress" | "review",
      updatedDay: number,
      dueDay: number | null
    ) => {
      const t = await Task.create({
        companyId: uid,
        projectId: project._id,
        title,
        assignedTo: uid,
        assignedBy: uid,
        status,
        dueDate: dueDay !== null ? new Date(2026, 7, dueDay) : null,
      });
      created.taskIds.push(t._id.toString());
      // timestamps:true overrides updatedAt on save, so pin it afterwards.
      await Task.updateOne(
        { _id: t._id },
        { $set: { updatedAt: new Date(2026, 7, updatedDay) } },
        { timestamps: false }
      );
      return t;
    };
    // 3 completed in range, on time
    const done1 = await mkTask("done1", "done", 3, 4);
    await mkTask("done2", "done", 5, 6);
    await mkTask("done3", "done", 8, 9);
    // completed but updated out of range, no due date -> counts nowhere
    await mkTask("oldDone", "done", 20, null);
    // completed in range but late (updatedAt after dueDate)
    await mkTask("lateDone", "done", 7, 3);
    // overdue (not done, due in the past relative to today Aug 11)
    await mkTask("overdue1", "in-progress", 1, 2);
    await mkTask("overdue2", "todo", 1, 9);
    // future -> not overdue
    await mkTask("future", "todo", 1, 12);

    // 18 logged hours (1080 min) against done1 (taskId -> project)
    const log = await TimeLog.create({
      companyId: uid,
      taskId: done1._id,
      userId: uid,
      startTime: new Date(2026, 7, 3, 10, 0),
      endTime: new Date(2026, 7, 3, 19, 0),
      durationMinutes: 1080,
      billable: true,
    });
    created.timeLogIds.push(log._id.toString());

    // --- Compute --------------------------------------------------------------
    const perf = await computeUserPerformance({
      companyId,
      userId: created.userId,
      from: startOfDay(new Date(2026, 7, 3)),
      to: endOfDay(new Date(2026, 7, 9)),
    });
    if (!perf) throw new Error("computeUserPerformance returned null");

    let failures = 0;
    const check = (name: string, actual: unknown, expected: unknown) => {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      if (!ok) failures++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    };

    const s = perf.summary;
    // expectedWorkingDays: Aug 3,4,6,7 = 4 (Aug 5 on approved leave)
    check("expectedWorkingDays", s.expectedWorkingDays, 4);
    check("presentDays", s.presentDays, 3);
    check("halfDays", s.halfDays, 1);
    // attendance% = (3+1)/4 = 100
    check("attendancePercentage", s.attendancePercentage, 100);
    // avg hours = (10+9+9+3)/4 = 7.75
    check("averageWorkingHours", s.averageWorkingHours, 7.75);
    check("overtimeHours", s.overtimeHours, 1);
    check("totalLoggedHours", s.totalLoggedHours, 18);
    // completed in range = done1, done2, done3, lateDone = 4
    check("tasksCompleted", s.tasksCompleted, 4);
    // overdue = overdue1, overdue2 = 2
    check("tasksOverdue", s.tasksOverdue, 2);
    // utilization = 18 / (4*9=36) = 50
    check("projectUtilization", s.projectUtilization, 50);
    check("leaveDays", s.leaveDays, 1);
    check("scores.attendance", s.scores.attendance, 100);
    check("scores.completion", s.scores.completion, 66.7); // 4/(4+2)
    check("scores.onTime", s.scores.onTime, 75); // done1,2,3 on time; lateDone late
    check("scores.utilization", s.scores.utilization, 50);
    // productivity = round(0.3*100 + 0.3*66.7 + 0.2*75 + 0.2*50) = 75
    check("productivityScore", s.productivityScore, 75);
    check("trend length", perf.attendanceTrend?.length, 4);
    check("projectBreakdown count", perf.projectBreakdown.length, 1);
    check("projectBreakdown hours", perf.projectBreakdown[0]?.loggedHours, 18);
    check("projectBreakdown name", perf.projectBreakdown[0]?.projectName, "Test Project");
    check("joiningDate", perf.joiningDate, "2026-01-15");

    console.log(failures === 0 ? "\nINTEGRATION: ALL PASS" : `\nINTEGRATION: ${failures} FAILURES`);
    await doCleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
  } catch (e) {
    console.error("Integration test error:", e);
    await doCleanup().catch(() => {});
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
