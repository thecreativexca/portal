/* eslint-disable */
// Reproduce the EXACT app model logic inline to isolate Mongoose 9 behavior
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

function loadEnv(file) {
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
  loadEnv("../.env.local");
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  console.log("Connected\n");

  // Replicate the app's User schema EXACTLY
  const UserSchema = new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      password: { type: String, required: true, minlength: 6, select: false },
      role: { type: String, enum: ["ceo", "manager", "employee"], default: "employee" },
      avatar: { type: String },
      createdAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  );

  UserSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  });

  UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  const Model = mongoose.models.DiagUser || mongoose.model("DiagUser", UserSchema);

  // Test 1: findOne with .select("+password")
  const user = await Model.findOne({ email: "ceo@company.com" }).select("+password");
  console.log("=== Test 1: findOne().select('+password') ===");
  if (!user) {
    console.log("USER NOT FOUND");
  } else {
    console.log("found user:", user.email, "role:", user.role);
    console.log("user.password present?", typeof user.password === "string" && user.password.length > 0);
    console.log("user.password prefix:", user.password ? user.password.slice(0, 7) : "(undefined)");
    console.log("typeof user.comparePassword:", typeof user.comparePassword);
  }

  // Test 2: comparePassword method
  if (user) {
    console.log("\n=== Test 2: user.comparePassword('password123') ===");
    try {
      const ok = await user.comparePassword("password123");
      console.log("comparePassword ->", ok);
    } catch (e) {
      console.log("comparePassword THREW:", e.message);
    }
  }

  // Test 3: direct bcrypt.compare with user.password
  if (user) {
    console.log("\n=== Test 3: bcrypt.compare('password123', user.password) ===");
    try {
      console.log("->", await bcrypt.compare("password123", user.password));
    } catch (e) {
      console.log("THREW:", e.message);
    }
  }

  // Test 4: does the returned doc have password in toObject with default projection?
  if (user) {
    console.log("\n=== Test 4: projection checks ===");
    const doc = user.toObject();
    console.log("toObject has password?", Object.prototype.hasOwnProperty.call(doc, "password"));
    console.log("toObject keys:", Object.keys(doc).join(", "));
  }

  await mongoose.disconnect();
  console.log("\nDone");
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
