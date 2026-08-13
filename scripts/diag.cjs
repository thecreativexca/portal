/* eslint-disable */
// Diagnostic script: inspect stored users and test password comparison
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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

async function main() {
  await loadEnv("../.env.local");
  const uri = process.env.MONGODB_URI;
  console.log("MONGODB_URI:", uri ? "present (length " + uri.length + ")" : "MISSING");

  try {
    await mongoose.connect(uri, { bufferCommands: false });
    console.log("Connected to MongoDB\n");

    const cols = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections:", cols.map((c) => c.name).join(", "), "\n");

    // Inspect the users collection directly (raw driver)
    const users = await mongoose.connection.db.collection("users").find({}).limit(10).toArray();
    console.log("=== Raw users documents (" + users.length + ") ===");
    for (const u of users) {
      const pw = u.password;
      const pwPreview =
        typeof pw === "string"
          ? pw.slice(0, 7) + "...(" + pw.length + " chars)"
          : String(pw);
      console.log(
        `  email=${u.email} | role=${u.role} | hasPassword=${typeof pw === "string" && pw.length > 0} | pwPrefix=${pwPreview}`
      );
      if (typeof pw === "string" && pw) {
        // is it a valid bcrypt hash?
        const looksBcrypt = /^\$2[aby]\$/.test(pw);
        console.log(`    looksLikeBcryptHash=${looksBcrypt}`);
        for (const candidate of ["password123", "admin123", "123456", "password", "Password123"]) {
          let cmp = "err";
          try {
            cmp = await bcrypt.compare(candidate, pw);
          } catch (e) {
            cmp = "THREW: " + e.message;
          }
          if (cmp === true) console.log(`    >>> bcrypt.compare("${candidate}", stored) = ${cmp}`);
        }
        // would a re-hash of the stored value produce a valid bcrypt too? (double-hash detection)
        const looksBcryptAgain = /^\$2[aby]\$/.test(pw);
        console.log(`    note: if a pre-save hook re-hashed an already-hashed value, compare would fail`);
      }
    }

    // Case sensitivity check
    console.log("\n=== Case-sensitivity of email lookup ===");
    const lower = await mongoose.connection.db.collection("users").findOne({ email: "ceo@company.com" });
    const upper = await mongoose.connection.db.collection("users").findOne({ email: "CEO@COMPANY.COM" });
    console.log("findOne ceo@company.com  ->", lower ? "FOUND" : "not found");
    console.log("findOne CEO@COMPANY.COM  ->", upper ? "FOUND" : "not found");

    await mongoose.disconnect();
    console.log("\nDone");
    process.exit(0);
  } catch (e) {
    console.error("ERROR:", e);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
}

main();
