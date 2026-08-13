/**
 * One-time production migration that moves existing single-tenant data into
 * the multi-company structure:
 *
 *  1. Provisions a Company (named from the existing Settings if present).
 *  2. Assigns companyId to every existing user and backfills the new
 *     fullName/status fields and the manager -> project_manager role mapping.
 *  3. Creates the default Department, the system Roles, and the Permission
 *     catalog (only if missing — idempotent).
 *  4. Backfills companyId on all existing attendance/leave/project/task/
 *     settings/activitylog/message documents via their related user.
 *
 * It does NOT create demo/mock records — the existing CEO and all real data
 * are preserved. On a brand-new database you must create the first company
 * and CEO separately.
 *
 * Run: npx ts-node scripts/migrate.ts
 */
import mongoose from "mongoose";

async function loadEnv() {
  const fs = await import("fs");
  const path = await import("path");
  // ts-node runs the script as CJS when __dirname exists, ESM otherwise.
  // Resolve .env.local from the script's directory or the project root.
  const candidates: string[] = [];
  if (typeof __dirname !== "undefined") {
    candidates.push(path.resolve(__dirname, "../.env.local"));
  }
  candidates.push(path.resolve(process.cwd(), ".env.local"));

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
    return;
  }
  console.warn("WARNING: could not find .env.local to load");
}

async function main() {
  await loadEnv();

  const { default: dbConnect } = await import("../lib/db");
  const { default: Company } = await import("../models/Company");
  const { default: User } = await import("../models/User");
  const { default: Department } = await import("../models/Department");
  const { default: Role } = await import("../models/Role");
  const { default: Permission } = await import("../models/Permission");
  const { default: Settings } = await import("../models/Settings");
  const { default: Attendance } = await import("../models/Attendance");
  const { default: Leave } = await import("../models/Leave");
  const { default: Project } = await import("../models/Project");
  const { default: Task } = await import("../models/Task");
  const { default: ActivityLog } = await import("../models/ActivityLog");
  const { default: Message } = await import("../models/Message");
  const { PERMISSION_CATALOG, ROLE_DEFINITIONS } = await import(
    "../lib/permissions"
  );

  await dbConnect();
  console.log("Connected to MongoDB");

  // ---- 1. Ensure a Company exists ----
  let company = await Company.findOne({}).sort({ createdAt: 1 });
  if (!company) {
    const settings = await Settings.findOne({});
    const name = settings?.companyName || "My Company";
    company = await Company.create({ name });
    console.log(`Created company: ${name} (${company._id})`);
  } else {
    console.log(`Using existing company: ${company.name} (${company._id})`);
  }
  const companyId = company._id;

  // ---- 2. Backfill users ----
  // Normalize new fields on all users (aggregation-pipeline update avoids the
  // pre-save hook, which would re-hash untouched passwords).
  await User.updateMany(
    {},
    [
      {
        $set: {
          fullName: { $ifNull: ["$fullName", "$name", ""] },
          name: { $ifNull: ["$name", "$fullName"] },
          status: { $ifNull: ["$status", "active"] },
          role: { $ifNull: ["$role", "employee"] },
        },
      },
    ],
    { updatePipeline: true }
  );

  const noCompanyRes = await User.updateMany(
    { companyId: { $exists: false } },
    { $set: { companyId } }
  );
  if (noCompanyRes.modifiedCount > 0) {
    console.log(`Assigned company to ${noCompanyRes.modifiedCount} user(s)`);
  }

  // Legacy "manager" role -> project_manager (typed as any because "manager"
  // is not a valid key in the new role union).
  const roleMapRes = await User.updateMany(
    { role: "manager" } as any,
    { $set: { role: "project_manager" } }
  );
  if (roleMapRes.modifiedCount > 0) {
    console.log(
      `Mapped ${roleMapRes.modifiedCount} manager(s) -> project_manager`
    );
  }

  // ---- 3. Ensure default Department ----
  const department = await Department.findOne({ companyId });
  if (!department) {
    await Department.create({
      companyId,
      name: "Administration",
      description: "Central administration",
    });
    console.log("Created default department: Administration");
  }

  // ---- 4. Seed the Permission catalog ----
  const permCount = await Permission.countDocuments({ companyId });
  if (permCount === 0) {
    await Permission.insertMany(
      PERMISSION_CATALOG.map((p) => ({
        companyId,
        name: p.name,
        key: p.key,
        module: p.module,
        description: p.description,
      }))
    );
    console.log(`Seeded ${PERMISSION_CATALOG.length} permissions`);
  } else {
    console.log(`Permissions already present (${permCount})`);
  }

  // ---- 5. Seed the system Roles ----
  const roleCount = await Role.countDocuments({ companyId });
  if (roleCount === 0) {
    await Role.insertMany(
      ROLE_DEFINITIONS.map((r) => ({
        companyId,
        name: r.name,
        key: r.key,
        description: r.description,
        permissions: r.permissions,
        isSystem: true,
      }))
    );
    console.log(`Seeded ${ROLE_DEFINITIONS.length} system roles`);
  } else {
    for (const def of ROLE_DEFINITIONS) {
      const exists = await Role.findOne({ companyId, key: def.key });
      if (!exists) {
        await Role.create({
          companyId,
          name: def.name,
          key: def.key,
          description: def.description,
          permissions: def.permissions,
          isSystem: true,
        });
      }
    }
    console.log("System roles verified");
  }

  // ---- 6. Backfill companyId on related documents ----
  const users = await User.find().select("_id companyId").lean();
  const companyByUser = new Map<string, string>();
  for (const u of users) {
    companyByUser.set(
      u._id.toString(),
      u.companyId?.toString() || companyId.toString()
    );
  }

  async function backfillByField(Model: any, field: string): Promise<number> {
    const docs = await Model.find({ companyId: { $exists: false } })
      .select(`_id ${field}`)
      .lean();
    let updated = 0;
    for (const d of docs) {
      const ref = d[field];
      const cid = ref ? companyByUser.get(ref.toString()) : undefined;
      if (!cid) continue;
      await Model.updateOne({ _id: d._id }, { $set: { companyId: cid } });
      updated++;
    }
    return updated;
  }

  const attendanceN = await backfillByField(Attendance, "userId");
  const leaveN = await backfillByField(Leave, "userId");
  const logN = await backfillByField(ActivityLog, "userId");
  const messageN = await backfillByField(Message, "senderId");
  const projectN = await backfillByField(Project, "createdBy");

  const taskDocs = await Task.find({ companyId: { $exists: false } })
    .select("_id assignedBy projectId")
    .lean();
  let taskN = 0;
  for (const t of taskDocs) {
    const ref = t.assignedBy || t.projectId;
    const cid = ref ? companyByUser.get(ref.toString()) : undefined;
    if (!cid) continue;
    await Task.updateOne({ _id: t._id }, { $set: { companyId: cid } });
    taskN++;
  }

  const settingsRes = await Settings.updateMany(
    { companyId: { $exists: false } },
    { $set: { companyId } }
  );

  console.log(
    `Backfilled companyId: ${attendanceN} attendance, ${leaveN} leaves, ` +
      `${projectN} projects, ${taskN} tasks, ${logN} logs, ` +
      `${messageN} messages, ${settingsRes.modifiedCount} settings`
  );

  // ---- 7. Sync user indexes (drops the legacy global email unique index,
  // creates the per-company {companyId, email} unique index) ----
  try {
    await User.syncIndexes();
    console.log("Synced user indexes (email unique per company)");
  } catch (e) {
    console.warn("Index sync skipped:", (e as Error).message);
  }

  const ceo = await User.findOne({ role: "ceo", companyId }).select(
    "fullName email"
  );
  if (ceo) {
    console.log("\nMigration complete. CEO login:");
    console.log(`  ${ceo.fullName} <${ceo.email}>`);
  } else {
    console.log(
      "\nMigration complete. No CEO found — create the company owner account."
    );
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
