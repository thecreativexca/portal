/**
 * Read-only smoke test for the Day 5 performance service.
 * Loads .env.local, connects, and prints computeUserPerformance +
 * computeTeamPerformance for the current month against real DB records.
 * Usage: npx tsx scripts/smoke-performance.ts
 */
import mongoose from "mongoose";

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
  const {
    computeUserPerformance,
    computeTeamPerformance,
    startOfDay,
    endOfDay,
  } = await import("../lib/performance");

  await dbConnect();

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = now;

  const ceo = await User.findOne({ companyId: { $exists: true } })
    .select("companyId")
    .lean();
  if (!ceo) {
    console.log("No users found — nothing to compute.");
    await mongoose.disconnect();
    return;
  }
  const companyId = ceo.companyId.toString();

  const users = await User.find({ companyId, status: "active" })
    .select("_id fullName name email role")
    .limit(5)
    .lean();
  console.log(`Company: ${companyId}  users found: ${users.length}`);
  console.log(`Range: ${from.toISOString()} -> ${to.toISOString()}\n`);

  for (const u of users) {
    const perf = await computeUserPerformance({
      companyId,
      userId: u._id.toString(),
      from: startOfDay(from),
      to: endOfDay(to),
    });
    if (!perf) {
      console.log(`User ${u.fullName || u.name}: NOT FOUND`);
      continue;
    }
    console.log(`--- ${perf.fullName} (${perf.role}) ---`);
    console.log(
      `  expectedDays=${perf.summary.expectedWorkingDays} present=${perf.summary.presentDays} half=${perf.summary.halfDays}`
    );
    console.log(
      `  attendance%=${perf.summary.attendancePercentage} avgHours=${perf.summary.averageWorkingHours} logged=${perf.summary.totalLoggedHours} overtime=${perf.summary.overtimeHours}`
    );
    console.log(
      `  tasksDone=${perf.summary.tasksCompleted} overdue=${perf.summary.tasksOverdue} utilization=${perf.summary.projectUtilization} leaveDays=${perf.summary.leaveDays}`
    );
    console.log(
      `  scores=${JSON.stringify(perf.summary.scores)} productivity=${perf.summary.productivityScore}`
    );
    console.log(`  projects=${perf.projectBreakdown.length} trend=${perf.attendanceTrend?.length || 0}`);
  }

  console.log("\n=== TEAM ===");
  const team = await computeTeamPerformance({
    companyId,
    from: startOfDay(from),
    to: endOfDay(to),
  });
  console.log(`members=${team?.members.length}`);
  console.log(`averages=${JSON.stringify(team?.averages)}`);
  console.log(`range=${JSON.stringify(team?.range)}`);

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
