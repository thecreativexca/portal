import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment, { PAYMENT_METHODS } from "@/models/Payment";
import { invoiceListPipeline, recomputePaidAmount } from "@/lib/invoiceQuery";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("invoices.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
    }

    const invoice = await Invoice.findOne({ _id: objectId, companyId });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot record a payment on a cancelled invoice" },
        { status: 400 }
      );
    }

    const body = await request.json();
    // Accept both the spec field names and the legacy UI names (date/method).
    const {
      amount,
      paymentDate,
      date,
      paymentMethod,
      method,
      transactionId,
      note,
    } = body;

    if (amount === undefined || amount === null || amount === "") {
      return NextResponse.json(
        { error: "Payment amount is required" },
        { status: 400 }
      );
    }
    const amountValue = Number(amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      return NextResponse.json(
        { error: "Payment amount must be a positive number" },
        { status: 400 }
      );
    }

    const methodValue = paymentMethod || method || "bank_transfer";
    if (!(PAYMENT_METHODS as readonly string[]).includes(methodValue)) {
      return NextResponse.json(
        { error: `Method must be one of: ${PAYMENT_METHODS.join(", ")}` },
        { status: 400 }
      );
    }

    await Payment.create({
      companyId,
      invoiceId: objectId,
      amount: amountValue,
      paymentDate: paymentDate
        ? new Date(paymentDate)
        : date
        ? new Date(date)
        : new Date(),
      paymentMethod: methodValue,
      transactionId: transactionId || "",
      note: note || "",
      recordedBy: actor._id,
    });

    // Recompute the running paid total from the ledger (aggregation).
    await recomputePaidAmount(objectId, companyId);

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "RECORD_PAYMENT",
      details: `Recorded ${amountValue} payment on invoice ${invoice.invoiceNumber}`,
    });

    const [result] = await Invoice.aggregate(
      invoiceListPipeline({ companyId, invoiceId: id })
    );

    return NextResponse.json({ invoice: result });
  } catch (error) {
    return handleApiError(error);
  }
}
