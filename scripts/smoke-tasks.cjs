/* eslint-disable */
// Temporary smoke test for the Day 4 task module DB layer. Connects to the
// real Mongo, exercises the partial-unique index that enforces one running
// timer per user, the workload aggregation, and TimeLog index builds. Creates
// docs under a throwaway companyId and deletes them before exiting.
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

async function loadEnv(file) {
  const p = path.resolve(__dirname, file);
  const content = fs.readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const TEST_COMPANY = new mongoose.Types.ObjectId();
const TEST_USER = new mongoose.Types.ObjectId();
const TEST_TASK = new mongoose.Types.ObjectId();
let failures = 0;

function check(name, ok, extra) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

async function main() {
  await loadEnv("../.env.local");
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  const timeLogs = db.collection("timelogs");
  const tasks = db.collection("tasks");
  const activity = db.collection("activitylogs");
  console.log("Connected:", process.env.MONGODB_URI.replace(/\/\/.*@/, "//***@").split("?")[0], "\n");

  // 1. Build the schema indexes exactly as models/TimeLog.ts declares them.
  await timeLogs.createIndex(
    { companyId: 1, userId: 1 },
    { unique: true, partialFilterExpression: { endTime: null } }
  );
  await timeLogs.createIndex({ taskId: 1, startTime: -1 });
  await timeLogs.createIndex({ userId: 1, startTime: -1 });

  const idx = await timeLogs.indexes();
  const hasPartial = idx.some(
    (i) => i.unique === true && i.partialFilterExpression && i.partialFilterExpression.endTime === null
  );
  check("partial unique index (one running timer per user)", hasPartial);

  // 2. Timer lifecycle: start (endTime null) -> second start blocked -> stop.
  await timeLogs.insertOne({
    companyId: TEST_COMPANY,
    taskId: TEST_TASK,
    userId: TEST_USER,
    startTime: new Date("2026-08-11T09:00:00.000Z"),
    endTime: null,
    durationMinutes: 0,
    notes: "running",
    billable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  let secondStartBlocked = false;
  try {
    await timeLogs.insertOne({
      companyId: TEST_COMPANY,
      taskId: TEST_TASK,
      userId: TEST_USER,
      startTime: new Date("2026-08-11T09:05:00.000Z"),
      endTime: null,
      durationMinutes: 0,
      notes: "second",
      billable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (e) {
    secondStartBlocked = e.code === 11000;
  }
  check("second concurrent running timer rejected by unique index", secondStartBlocked);

  await timeLogs.updateOne(
    { companyId: TEST_COMPANY, userId: TEST_USER, endTime: null },
    { $set: { endTime: new Date("2026-08-11T11:30:00.000Z"), durationMinutes: 150, notes: "2h30m" } }
  );

  // 3. A completed log from another task feeds the workload aggregate.
  await timeLogs.insertOne({
    companyId: TEST_COMPANY,
    taskId: new mongoose.Types.ObjectId(),
    userId: TEST_USER,
    startTime: new Date("2026-08-10T08:00:00.000Z"),
    endTime: new Date("2026-08-10T10:00:00.000Z"),
    durationMinutes: 120,
    notes: "",
    billable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const agg = await timeLogs
    .aggregate([
      { $match: { companyId: TEST_COMPANY, userId: TEST_USER, endTime: { $ne: null } } },
      { $group: { _id: "$userId", total: { $sum: "$durationMinutes" } } },
    ])
    .toArray();
  const total = agg.length ? agg[0].total : 0;
  check("workload aggregate sums completed minutes", total === 270, `got ${total}`);

  // 4. ActivityLog / Task index creation.
  await tasks.createIndex({ companyId: 1, status: 1, dueDate: 1 });
  await tasks.createIndex({ assignedTo: 1 });
  await tasks.createIndex({ projectId: 1, status: 1 });
  await tasks.createIndex({ dependencyTaskIds: 1 });
  await activity.createIndex({ taskId: 1, timestamp: -1 });
  check("task + activity indexes build without error", true);

  // Cleanup.
  await timeLogs.deleteMany({ companyId: TEST_COMPANY });
  check("cleanup removed test time logs", (await timeLogs.countDocuments({ companyId: TEST_COMPANY })) === 0);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("SMOKE FAILED:", e);
  await mongoose.disconnect();
  process.exit(1);
});
