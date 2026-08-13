/* eslint-disable */
// TEMP diagnostic: scan cluster0 to find the company-portal database.
// Prints DB names, collection names, doc counts, and user-like sample data
// (emails/roles only, NOT full password hashes). Never prints the URI.
const mongoose = require("mongoose");

// Cluster provided by the user (no DB name appended — default "test" used only for connecting)
const URI = process.env.CLUSTER0_URI;

function summarize(d) {
  const keys = Object.keys(d);
  return {
    email: d.email || d.Email || d.username || d.user || null,
    role: d.role || d.Role || null,
    name: d.name || d.displayName || d.fullName || null,
    hasPassword: typeof d.password === "string" && d.password.length > 0,
    passwordPrefix: typeof d.password === "string" ? d.password.slice(0, 7) : null,
  };
}

async function inspectDb(name) {
  const uri = URI + "/" + name + "?retryWrites=true&w=majority";
  await mongoose.connect(uri, { bufferCommands: false });
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  const out = { db: name, collections: [] };
  for (const c of cols) {
    const entry = { name: c.name, docs: 0 };
    try { entry.docs = await db.collection(c.name).countDocuments(); } catch (_) {}
    if (/user|account|employee|member|admin/i.test(c.name) && entry.docs > 0 && entry.docs <= 200) {
      try {
        const sample = await db.collection(c.name).find({}).limit(20).toArray();
        entry.sample = sample.map(summarize);
      } catch (_) {}
    }
    out.collections.push(entry);
  }
  await mongoose.disconnect();
  return out;
}

(async () => {
  if (!URI) { console.error("Set CLUSTER0_URI first"); process.exit(1); }
  await mongoose.connect(URI, { bufferCommands: false });
  const admin = mongoose.connection.db.admin();
  const { databases } = await admin.listDatabases();
  console.log("=== Databases on cluster0 ===");
  for (const d of databases) {
    console.log(`  - ${d.name}  (${(d.sizeOnDisk / 1024 / 1024).toFixed(1)} MB)`);
  }
  await mongoose.disconnect();

  const names = databases.map((d) => d.name).filter((n) => !/^(admin|local|config|test)$/.test(n));
  const results = [];
  for (const name of names) {
    try { results.push(await inspectDb(name)); } catch (e) { results.push({ db: name, error: e.message }); }
  }
  console.log("\n=== Per-DB inspection ===");
  for (const r of results) {
    if (r.error) { console.log(`\n[${r.db}] ERROR: ${r.error}`); continue; }
    console.log(`\n[${r.db}]`);
    for (const c of r.collections) {
      console.log(`  ${c.name}: ${c.docs} docs`);
      if (c.sample && c.sample.length) {
        for (const s of c.sample) {
          console.log(`    email=${s.email} | role=${s.role} | name=${s.name} | hasPw=${s.hasPassword} | pwPrefix=${s.passwordPrefix}`);
        }
      }
    }
  }
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
