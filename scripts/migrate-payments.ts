/**
 * One-time migration for the Finance module (Day 6).
 *
 * Payments moved from being embedded inside Invoice documents to a standalone
 * Payment collection. This script:
 *
 *  1. Copies every embedded payment into a Payment document (companyId,
 *     invoiceId, amount, paymentDate, paymentMethod, note, recordedBy).
 *  2. Recomputes each invoice's paidAmount from the migrated payments (capped
 *     at amount + tax) so it stays consistent.
 *  3. Removes the now-redundant embedded `payments` array from invoices.
 *  4. Backfills the new fields: tax (0) and items ([]) where missing.
 *
 * Idempotent: once the embedded array is gone there is nothing left to copy.
 *
 * Run: npx ts-node scripts/migrate-payments.ts
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
  const { default: Invoice } = await import("../models/Invoice");
  const { default: Payment } = await import("../models/Payment");

  await dbConnect();
  console.log("Connected to MongoDB");

  const invoices = await Invoice.find({
    payments: { $exists: true, $type: "array", $ne: [] },
  }).lean();

  if (invoices.length === 0) {
    console.log("No embedded payments to migrate. Nothing to do.");
  } else {
    let copied = 0;
    for (const inv of invoices as any[]) {
      const docs = (inv.payments || []).map((p: any) => ({
        companyId: inv.companyId,
        invoiceId: inv._id,
        amount: p.amount,
        paymentDate: p.date || p.paymentDate || new Date(),
        paymentMethod: p.method || p.paymentMethod || "bank_transfer",
        transactionId: p.transactionId,
        note: p.note || "",
        recordedBy: p.recordedBy || inv.createdBy,
        createdAt: p.createdAt || new Date(),
        updatedAt: p.updatedAt || new Date(),
      }));
      if (docs.length > 0) {
        await Payment.insertMany(docs);
        copied += docs.length;
      }
      // Recompute paidAmount from the migrated payments.
      const paid = docs.reduce((s: number, d: any) => s + (d.amount || 0), 0);
      const total = (inv.amount || 0) + (inv.tax || 0);
      const paidAmount = Math.min(paid, total);
      await Invoice.updateOne(
        { _id: inv._id },
        { $set: { paidAmount }, $unset: { payments: "" } }
      );
    }
    console.log(`Copied ${copied} payment(s) into the Payment collection.`);
  }

  // Backfill the new invoice fields (tax, items) where missing.
  const taxRes = await Invoice.updateMany(
    { tax: { $exists: false } },
    { $set: { tax: 0 } }
  );
  const itemsRes = await Invoice.updateMany(
    { items: { $exists: false } },
    { $set: { items: [] } }
  );
  console.log(
    `Backfilled tax on ${taxRes.modifiedCount} and items on ${itemsRes.modifiedCount} invoice(s).`
  );

  console.log("Done.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
