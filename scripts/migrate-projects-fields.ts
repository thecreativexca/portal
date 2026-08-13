/**
 * One-time migration that renames the Project fields introduced before the
 * project portfolio module (Day 3) to match the documented schema:
 *
 *   title        -> projectName
 *   teamMembers  -> teamMemberIds
 *
 * It also backfills the new `actualHours` field (default 0) where missing.
 * Idempotent: re-running is a no-op once the renames have happened.
 *
 * Run: npx ts-node scripts/migrate-projects-fields.ts
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
  const { default: Project } = await import("../models/Project");

  await dbConnect();
  console.log("Connected to MongoDB");

  // Rename title -> projectName on legacy docs.
  const titleRes = await Project.updateMany(
    { title: { $exists: true } },
    { $rename: { title: "projectName" } }
  );
  if (titleRes.modifiedCount > 0) {
    console.log(`Renamed title -> projectName on ${titleRes.modifiedCount} project(s)`);
  } else {
    console.log("No legacy 'title' fields found");
  }

  // Rename teamMembers -> teamMemberIds on legacy docs.
  const teamRes = await Project.updateMany(
    { teamMembers: { $exists: true } },
    { $rename: { teamMembers: "teamMemberIds" } }
  );
  if (teamRes.modifiedCount > 0) {
    console.log(
      `Renamed teamMembers -> teamMemberIds on ${teamRes.modifiedCount} project(s)`
    );
  } else {
    console.log("No legacy 'teamMembers' fields found");
  }

  // Backfill actualHours where missing.
  const hoursRes = await Project.updateMany(
    { actualHours: { $exists: false } },
    { $set: { actualHours: 0 } }
  );
  if (hoursRes.modifiedCount > 0) {
    console.log(`Backfilled actualHours on ${hoursRes.modifiedCount} project(s)`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
