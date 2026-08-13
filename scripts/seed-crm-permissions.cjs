/* eslint-disable */
/**
 * Idempotent CRM permission sync (plain JS — no ts-node needed).
 *
 * For every company it:
 *  1. Inserts missing Permission documents for crm.read / crm.write.
 *  2. Adds the CRM permission keys to each system Role's permissions array
 *     ($addToSet — additive, safe to re-run).
 *
 * Run: node scripts/seed-crm-permissions.cjs
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const CRM_PERMISSIONS = [
  { key: "crm.read", name: "View CRM", module: "crm", description: "View the sales pipeline, leads, opportunities, and follow-ups" },
  { key: "crm.write", name: "Manage CRM", module: "crm", description: "Create, edit, and move leads and opportunities, and schedule follow-ups" },
];

const ROLE_CRM_PERMS = {
  ceo: ["crm.read", "crm.write"],
  hr: ["crm.read"],
  project_manager: ["crm.read", "crm.write"],
  team_lead: ["crm.read"],
  accounts: ["crm.read"],
  employee: [],
};

const ROLE_INFO = {
  ceo: { name: "CEO", description: "Full access to the entire company workspace" },
  hr: { name: "HR", description: "Manage employees, departments, and leave approvals" },
  project_manager: { name: "Project Manager", description: "Plan and run projects and tasks across teams" },
  team_lead: { name: "Team Lead", description: "Lead a team and manage its tasks" },
  employee: { name: "Employee", description: "View own work, mark attendance, and request leaves" },
  accounts: { name: "Accounts", description: "Finance and company reporting" },
};

function loadEnv() {
  const candidates = [path.resolve(__dirname, "../.env.local"), path.resolve(__dirname, "../.env")];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
    return;
  }
}

async function main() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in .env.local / .env");
    process.exit(1);
  }

  await mongoose.connect(uri, { bufferCommands: false });
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;

  // Company collection name is derived from the model ("Company" -> "companies").
  const companies = await db.collection("companies").find({}).toArray();
  if (companies.length === 0) {
    console.warn("No companies found — nothing to seed.");
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const company of companies) {
    const companyId = company._id;
    const name = company.name || companyId.toString();

    // 1. Permission catalog.
    const existing = await db
      .collection("permissions")
      .find({ companyId })
      .project({ key: 1 })
      .toArray();
    const existingKeys = new Set(existing.map((p) => p.key));
    const missing = CRM_PERMISSIONS.filter((p) => !existingKeys.has(p.key));
    if (missing.length > 0) {
      await db.collection("permissions").insertMany(
        missing.map((p) => ({
          companyId,
          name: p.name,
          key: p.key,
          module: p.module,
          description: p.description,
        }))
      );
      console.log(`[${name}] added permission(s): ${missing.map((p) => p.key).join(", ")}`);
    } else {
      console.log(`[${name}] CRM permissions already up to date`);
    }

    // 2. System roles.
    for (const [roleKey, perms] of Object.entries(ROLE_CRM_PERMS)) {
      if (!perms.length) continue;
      const info = ROLE_INFO[roleKey];
      const res = await db.collection("roles").updateOne(
        { companyId, key: roleKey },
        {
          $setOnInsert: { name: info.name, description: info.description, isSystem: true },
          $addToSet: { permissions: { $each: perms } },
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        console.log(`[${name}] created system role ${roleKey}`);
      } else if (res.modifiedCount > 0) {
        console.log(`[${name}] updated permissions for role ${roleKey}`);
      }
    }
  }

  console.log("Done. Sync complete.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
