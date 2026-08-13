import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import { invoiceListPipeline, recomputePaidAmount } from "@/lib/invoiceQuery";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("invoices.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id, paymentId } = await params;
    const objectId = toObjectId(id);
    const paymentObjectId = toObjectId(paymentId);
    if (!objectId || !paymentObjectId) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const invoice = await Invoice.findOne({ _id: objectId, companyId });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const payment = await Payment.findOne({
      _id: paymentObjectId,
      invoiceId: objectId,
      companyId,
    });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    await payment.deleteOne();
    await recomputePaidAmount(objectId, companyId);

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_PAYMENT",
      details: `Removed ${payment.amount} payment from invoice ${invoice.invoiceNumber}`,
    });

    const [result] = await Invoice.aggregate(
      invoiceListPipeline({ companyId, invoiceId: id })
    );

    return NextResponse.json({ invoice: result });
  } catch (error) {
    return handleApiError(error);
  }
}
