/**
 * Temporary smoke test: proves the Notification / Approval / Document
 * collections are writable and readable against real MongoDB.
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
}

async function main() {
  await loadEnv();
  const { default: dbConnect } = await import("../lib/db");
  const { default: User } = await import("../models/User");
  const { default: Notification } = await import("../models/Notification");
  const { default: Approval } = await import("../models/Approval");
  const { default: Document } = await import("../models/Document");

  await dbConnect();

  const user = await User.findOne().lean();
  if (!user) throw new Error("No user found");
  const companyId = user.companyId.toString();
  const userId = user._id.toString();

  // 1. Notification
  const notif = await Notification.create({
    companyId,
    userId,
    title: "Smoke test",
    message: "Notification collection is live",
    type: "system",
  });
  const notifBack = await Notification.findOne({ _id: notif._id }).lean();
  console.log("Notification OK:", notifBack?.title, "| unread:", notifBack?.isRead === false);

  // 2. Approval
  const approval = await Approval.create({
    companyId,
    type: "general",
    title: "Smoke test request",
    description: "Approval collection is live",
    requestedBy: userId,
    status: "pending",
  });
  const approvalBack = await Approval.findOne({ _id: approval._id })
    .populate("requestedBy", "name")
    .lean();
  console.log("Approval OK:", approvalBack?.title, "| status:", approvalBack?.status);

  // 3. Document (tiny base64 payload)
  const data = Buffer.from("hello portal").toString("base64");
  const docId = new mongoose.Types.ObjectId();
  const doc = await Document.create({
    _id: docId,
    companyId,
    folder: "Smoke",
    name: "smoke.txt",
    url: `/api/documents/${docId.toString()}/download`,
    mimeType: "text/plain",
    size: 12,
    data,
    uploadedBy: userId,
  });
  const docBack = await Document.findOne({ _id: doc._id }).select("+data").lean();
  const decoded = docBack?.data ? Buffer.from(docBack.data, "base64").toString() : null;
  console.log("Document OK:", docBack?.name, "| folder:", docBack?.folder, "| decoded:", decoded);

  // Cleanup — remove smoke records.
  await Notification.deleteOne({ _id: notif._id });
  await Approval.deleteOne({ _id: approval._id });
  await Document.deleteOne({ _id: doc._id });
  console.log("Cleanup done. Collections verified against real MongoDB.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("Smoke failed:", e);
  await mongoose.disconnect();
  process.exit(1);
});
