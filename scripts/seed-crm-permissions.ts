/**
 * Idempotent permission sync for the CRM module.
 *
 * For every company it:
 *  1. Inserts any missing Permission documents from the catalog (this adds
 *     crm.read / crm.write to existing deployments without wiping anything).
 *  2. Merges the updated system-role permission sets into each company's
 *     existing system Role documents ($addToSet — additive and safe to re-run).
 *
 * Run: npx ts-node scripts/seed-crm-permissions.ts
 */
import mongoose from "mongoose";

async function loadEnv() {
  const fs = await import("fs");
  const path = await import("path");
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
  const { default: Permission } = await import("../models/Permission");
  const { default: Role } = await import("../models/Role");
  const { PERMISSION_CATALOG, ROLE_DEFINITIONS } = await import(
    "../lib/permissions"
  );

  await dbConnect();
  console.log("Connected to MongoDB");

  const companies = await Company.find().lean();
  if (companies.length === 0) {
    console.warn("No companies found — nothing to seed.");
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const company of companies) {
    const companyId = company._id;

    // 1. Permission catalog.
    const existingPerms = await Permission.find({ companyId })
      .select("key")
      .lean();
    const existingKeys = new Set(existingPerms.map((p) => p.key));
    const missing = PERMISSION_CATALOG.filter((p) => !existingKeys.has(p.key));
    if (missing.length > 0) {
      await Permission.insertMany(
        missing.map((p) => ({
          companyId,
          name: p.name,
          key: p.key,
          module: p.module,
          description: p.description,
        }))
      );
      console.log(
        `[${company.name}] added ${missing.length} permission(s): ${missing
          .map((p) => p.key)
          .join(", ")}`
      );
    } else {
      console.log(`[${company.name}] permissions already up to date`);
    }

    // 2. System roles — merge new permissions into existing role documents.
    for (const def of ROLE_DEFINITIONS) {
      const res = await Role.updateOne(
        { companyId, key: def.key },
        {
          $setOnInsert: {
            name: def.name,
            description: def.description,
            isSystem: true,
          },
          $addToSet: { permissions: { $each: def.permissions } },
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        console.log(`[${company.name}] created system role ${def.key}`);
      } else if (res.modifiedCount > 0) {
        console.log(`[${company.name}] updated permissions for role ${def.key}`);
      }
    }
  }

  console.log("Done. Sync complete.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
