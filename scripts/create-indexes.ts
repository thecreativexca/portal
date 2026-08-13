/**
 * Create the production MongoDB indexes from lib/indexes.ts.
 *
 * Idempotent — re-running is safe (identical indexes are no-ops). Connects to
 * the same MONGODB_URI as the app (uses .env.local when present).
 *
 * Run: npx ts-node scripts/create-indexes.ts
 */
import mongoose from "mongoose";
import { INDEX_REGISTRY } from "../lib/indexes";

async function loadEnv() {
  const fs = await import("fs");
  const path = await import("path");
  const candidates: string[] = [];
  if (typeof __dirname !== "undefined") {
    candidates.push(path.resolve(__dirname, "../.env.local"));
  }
  candidates.push(path.resolve(process.cwd(), ".env.local"));
  candidates.push(path.resolve(process.cwd(), ".env"));

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
  console.warn("WARNING: could not find .env.local or .env to load MONGODB_URI");
}

async function main() {
  await loadEnv();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(uri, { bufferCommands: false });
  console.log(`Connected to ${uri.split("@")[1]?.split("/")[0] ?? "MongoDB"}`);

  let created = 0;
  let errors = 0;

  for (const [collection, specs] of Object.entries(INDEX_REGISTRY)) {
    if (specs.length === 0) continue;
    const col = mongoose.connection.collection(collection);
    for (const spec of specs) {
      try {
        const result = await col.createIndexes([spec as never]);
        const names = Array.isArray(result) ? result : [result];
        console.log(`  ${collection}: ${names.join(", ")}`);
        created += names.length;
      } catch (error) {
        errors += 1;
        console.error(
          `  ${collection}: FAILED ${JSON.stringify(spec.key)} —`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  console.log(`\nDone. Created ${created} index(es), ${errors} error(s).`);
  await mongoose.disconnect();
  process.exit(errors ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
