import mongoose from "mongoose";

async function seed() {
  try {
    // Load .env.local manually BEFORE anything else
    const fs = await import("fs");
    const path = await import("path");
    const envPath = path.resolve(__dirname, "../.env.local");
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    // Now import db and User dynamically (so env vars are set)
    const { default: dbConnect } = await import("../lib/db");
    const { default: User } = await import("../models/User");

    await dbConnect();
    console.log("Connected to MongoDB");

    const existingCEO = await User.findOne({ role: "ceo" });
    if (existingCEO) {
      console.log("CEO user already exists:");
      console.log(`  Name: ${existingCEO.name}`);
      console.log(`  Email: ${existingCEO.email}`);
      console.log(`  Role: ${existingCEO.role}`);
      await mongoose.disconnect();
      return;
    }

    const ceo = await User.create({
      name: "CEO",
      email: "ceo@company.com",
      password: "password123",
      role: "ceo",
    });

    console.log("CEO user created successfully:");
    console.log(`  Name: ${ceo.name}`);
    console.log(`  Email: ${ceo.email}`);
    console.log(`  Role: ${ceo.role}`);
    console.log("\nLogin credentials:");
    console.log("  Email: ceo@company.com");
    console.log("  Password: password123");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error seeding CEO user:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();