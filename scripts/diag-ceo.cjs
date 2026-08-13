/* eslint-disable */
// Diagnostic script: run every CEO dashboard aggregation pipeline against the
// live database to prove the MongoDB syntax executes (tsc can't validate
// aggregation pipelines). Read-only — nothing is written.
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

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function monthEnd() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}
function yearStart() {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  await loadEnv("../.env.local");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  await mongoose.connect(uri, { bufferCommands: false });
  console.log("Connected to MongoDB\n");

  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  console.log("Collections:", cols.map((c) => c.name).join(", "), "\n");

  // Find a companyId to scope queries (first user with a companyId).
  const firstUser = await db.collection("users").findOne({ companyId: { $ne: null } });
  if (!firstUser) throw new Error("No users with companyId found");
  const companyObjectId = firstUser.companyId;
  console.log("Using companyId:", companyObjectId.toString(), "\n");

  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const monthStartDate = monthStart();
  const monthEndDate = monthEnd();
  const yearStartDate = yearStart();
  const sevenDaysOut = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rangeStart = new Date(yearStartDate);
  rangeStart.setMonth(rangeStart.getMonth() - 5); // 6-month axis

  const results = {};
  const errors = [];

  async function run(name, fn) {
    try {
      results[name] = await fn();
      console.log(`OK   ${name}`);
    } catch (e) {
      errors.push(name);
      console.log(`FAIL ${name} -> ${e.message}`);
    }
  }

  // ---- KPIs route aggregations ----
  await run("attendanceByStatus", () =>
    db
      .collection("attendances")
      .aggregate([
        { $match: { companyId: companyObjectId, date: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray()
  );

  await run("projectHealth", () =>
    db
      .collection("projects")
      .aggregate([
        { $match: { companyId: companyObjectId, status: { $in: ["active", "on-hold"] } } },
        { $lookup: { from: "milestones", localField: "_id", foreignField: "projectId", as: "_milestones" } },
        {
          $addFields: {
            _overdueMilestone: {
              $gt: [
                { $size: { $filter: { input: "$_milestones", as: "m", cond: { $and: [
                  { $ne: ["$$m.status", "completed"] },
                  { $ifNull: ["$$m.dueDate", null] },
                  { $lt: ["$$m.dueDate", todayStart] },
                ] } } } },
                0,
              ],
            },
            _endPassed: { $and: [{ $ifNull: ["$endDate", null] }, { $lt: ["$endDate", todayStart] }] },
            _endingSoon: { $and: [
              { $ifNull: ["$endDate", null] },
              { $gte: ["$endDate", todayStart] },
              { $lte: ["$endDate", sevenDaysOut] },
              { $lt: [{ $ifNull: ["$progress", 0] }, 100] },
            ] },
            _hoursOver: { $and: [
              { $ifNull: ["$estimatedHours", null] },
              { $ifNull: ["$actualHours", null] },
              { $gt: ["$actualHours", "$estimatedHours"] },
            ] },
          },
        },
        { $addFields: { _overdue: { $or: ["$_endPassed", "$_overdueMilestone"] }, _atRisk: { $or: ["$_endingSoon", "$_hoursOver"] } } },
        { $group: { _id: null, total: { $sum: 1 }, atRisk: { $sum: { $cond: ["$_atRisk", 1, 0] } }, overdue: { $sum: { $cond: ["$_overdue", 1, 0] } } } },
      ])
      .toArray()
  );

  await run("revenueThisMonthYear", () =>
    db
      .collection("payments")
      .aggregate([
        { $match: { companyId: companyObjectId, paymentDate: { $gte: yearStartDate } } },
        { $group: { _id: null,
          thisMonth: { $sum: { $cond: [{ $and: [{ $gte: ["$paymentDate", monthStartDate] }, { $lte: ["$paymentDate", monthEndDate] }] }, "$amount", 0] } },
          thisYear: { $sum: "$amount" } } },
      ])
      .toArray()
  );

  await run("outstandingInvoices", () =>
    db
      .collection("invoices")
      .aggregate([
        { $match: { companyId: companyObjectId, status: "sent" } },
        { $addFields: { _total: { $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }] } } },
        { $addFields: { _outstanding: { $max: [0, { $subtract: ["$_total", { $ifNull: ["$paidAmount", 0] }] }] } } },
        { $match: { _outstanding: { $gt: 0 } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$_outstanding" } } },
      ])
      .toArray()
  );

  await run("expensesThisMonth", () =>
    db
      .collection("expenses")
      .aggregate([
        { $match: { companyId: companyObjectId, date: { $gte: monthStartDate, $lte: monthEndDate } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray()
  );

  await run("payrollThisMonth", () =>
    db
      .collection("payrolls")
      .aggregate([
        { $match: { companyId: companyObjectId, month: currentMonthKey(), paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$netSalary" } } },
      ])
      .toArray()
  );

  await run("topRevenueClients", () =>
    db
      .collection("payments")
      .aggregate([
        { $match: { companyId: companyObjectId, paymentDate: { $gte: yearStartDate } } },
        { $lookup: { from: "invoices", localField: "invoiceId", foreignField: "_id", as: "_invoice" } },
        { $unwind: { path: "$_invoice", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "clients", localField: "_invoice.clientId", foreignField: "_id", as: "_client" } },
        { $unwind: { path: "$_client", preserveNullAndEmptyArrays: true } },
        { $group: { _id: "$_client._id", clientName: { $first: { $ifNull: ["$_client.clientName", "Unknown"] } }, revenue: { $sum: "$amount" }, invoiceCount: { $sum: { $cond: [{ $ifNull: ["$_invoice._id", null] }, 1, 0] } } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ])
      .toArray()
  );

  await run("recentActivity", () =>
    db
      .collection("activitylogs")
      .aggregate([
        { $match: { companyId: companyObjectId } },
        { $sort: { timestamp: -1 } },
        { $limit: 12 },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "_user" } },
        { $unwind: { path: "$_user", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, action: 1, details: 1, timestamp: 1, userName: { $ifNull: ["$_user.fullName", "Unknown"] } } },
      ])
      .toArray()
  );

  // ---- Charts route aggregations ----
  await run("revenueByMonth", () =>
    db
      .collection("payments")
      .aggregate([
        { $match: { companyId: companyObjectId, paymentDate: { $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$paymentDate" } }, revenue: { $sum: "$amount" } } },
      ])
      .toArray()
  );

  await run("expensesByMonth", () =>
    db
      .collection("expenses")
      .aggregate([
        { $match: { companyId: companyObjectId, date: { $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$date" } }, expenses: { $sum: "$amount" } } },
      ])
      .toArray()
  );

  await run("completionsByMonth", () =>
    db
      .collection("milestones")
      .aggregate([
        { $match: { companyId: companyObjectId, status: "completed", completedAt: { $ne: null, $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$completedAt" } }, completed: { $sum: 1 } } },
      ])
      .toArray()
  );

  await run("hiresByMonth", () =>
    db
      .collection("users")
      .aggregate([
        { $match: { companyId: companyObjectId, createdAt: { $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, hired: { $sum: 1 } } },
      ])
      .toArray()
  );

  await run("clientsByMonth", () =>
    db
      .collection("clients")
      .aggregate([
        { $match: { companyId: companyObjectId, deletedAt: null, createdAt: { $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, acquired: { $sum: 1 } } },
      ])
      .toArray()
  );

  // ---- Briefing route aggregations ----
  await run("delayedProjects", () =>
    db
      .collection("projects")
      .aggregate([
        { $match: { companyId: companyObjectId, status: { $in: ["active", "on-hold"] } } },
        { $lookup: { from: "milestones", localField: "_id", foreignField: "projectId", as: "_milestones" } },
        { $addFields: {
          _overdueMilestoneCount: { $size: { $filter: { input: "$_milestones", as: "m", cond: { $and: [
            { $ne: ["$$m.status", "completed"] },
            { $ifNull: ["$$m.dueDate", null] },
            { $lt: ["$$m.dueDate", todayStart] },
          ] } } } },
          _daysOverdue: { $cond: [{ $ifNull: ["$endDate", null] }, { $ceil: { $divide: [{ $subtract: [todayStart, "$endDate"] }, 86400000] } }, 0] },
        } },
        { $match: { $or: [{ _overdueMilestoneCount: { $gt: 0 } }, { _daysOverdue: { $gt: 0 } }] } },
        { $project: { _id: 1, projectName: 1, status: 1, endDate: 1, overdueMilestones: 1 } },
        { $sort: { _daysOverdue: -1 } },
        { $limit: 8 },
      ])
      .toArray()
  );

  await run("overdueInvoices", () =>
    db
      .collection("invoices")
      .aggregate([
        { $match: { companyId: companyObjectId, status: "sent" } },
        { $addFields: { _total: { $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }] }, _daysOverdue: { $ceil: { $divide: [{ $subtract: [todayStart, "$dueDate"] }, 86400000] } } } },
        { $addFields: { outstanding: { $max: [0, { $subtract: ["$_total", { $ifNull: ["$paidAmount", 0] }] }] } } },
        { $match: { dueDate: { $ne: null, $lt: todayStart }, outstanding: { $gt: 0 } } },
        { $lookup: { from: "clients", localField: "clientId", foreignField: "_id", as: "_client" } },
        { $unwind: { path: "$_client", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, invoiceNumber: 1, outstanding: 1, dueDate: 1, clientName: { $ifNull: ["$_client.clientName", "Unknown"] } } },
        { $sort: { _daysOverdue: -1 } },
        { $limit: 8 },
      ])
      .toArray()
  );

  await run("presentIdsToday", () =>
    db
      .collection("attendances")
      .aggregate([
        { $match: { companyId: companyObjectId, date: { $gte: todayStart, $lte: todayEnd }, status: { $in: ["present", "half-day"] } } },
        { $group: { _id: "$userId" } },
      ])
      .toArray()
  );

  await run("leaveIdsToday", () =>
    db
      .collection("leaves")
      .aggregate([
        { $match: { companyId: companyObjectId, status: "approved", startDate: { $lte: todayEnd }, endDate: { $gte: todayStart } } },
        { $group: { _id: "$userId" } },
      ])
      .toArray()
  );

  await run("tasksDueSoon", () =>
    db
      .collection("tasks")
      .aggregate([
        { $match: { companyId: companyObjectId, status: { $nin: ["done"] }, dueDate: { $gte: todayStart, $lte: sevenDaysOut } } },
        { $lookup: { from: "users", localField: "assignedTo", foreignField: "_id", as: "_assignee" } },
        { $unwind: { path: "$_assignee", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "_project" } },
        { $unwind: { path: "$_project", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, title: 1, dueDate: 1, priority: 1, assigneeName: { $ifNull: ["$_assignee.fullName", "Unassigned"] }, projectName: { $ifNull: ["$_project.projectName", null] } } },
        { $sort: { dueDate: 1 } },
        { $limit: 10 },
      ])
      .toArray()
  );

  await run("milestonesDueSoon", () =>
    db
      .collection("milestones")
      .aggregate([
        { $match: { companyId: companyObjectId, status: { $ne: "completed" }, dueDate: { $gte: todayStart, $lte: sevenDaysOut } } },
        { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "_project" } },
        { $unwind: { path: "$_project", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, title: 1, dueDate: 1, projectName: { $ifNull: ["$_project.projectName", "Unknown"] } } },
        { $sort: { dueDate: 1 } },
        { $limit: 8 },
      ])
      .toArray()
  );

  await run("newLeads", () =>
    db
      .collection("leads")
      .aggregate([
        { $match: { companyId: companyObjectId, deletedAt: null, createdAt: { $gte: sevenDaysAgo } } },
        { $project: { _id: 1, companyName: 1, estimatedValue: 1, stage: 1, createdAt: 1 } },
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
      ])
      .toArray()
  );

  await run("pendingLeaves", () =>
    db
      .collection("leaves")
      .aggregate([
        { $match: { companyId: companyObjectId, status: "pending" } },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "_user" } },
        { $unwind: { path: "$_user", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, leaveType: 1, startDate: 1, endDate: 1, reason: 1, userName: { $ifNull: ["$_user.fullName", "Unknown"] } } },
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
      ])
      .toArray()
  );

  console.log("\n=== Results (sample) ===");
  for (const [name, val] of Object.entries(results)) {
    console.log(`\n--- ${name} ---`);
    if (Array.isArray(val)) {
      console.log(JSON.stringify(val.slice(0, 3), null, 2));
    } else {
      console.log(JSON.stringify(val, null, 2));
    }
  }

  if (errors.length) {
    console.error("\nFAILED:", errors.join(", "));
    process.exit(1);
  }
  console.log("\nALL AGGREGATIONS OK");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
