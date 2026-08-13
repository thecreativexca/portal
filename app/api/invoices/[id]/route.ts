import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Invoice, { INVOICE_STATUSES } from "@/models/Invoice";
import Client from "@/models/Client";
import Project from "@/models/Project";
import Payment from "@/models/Payment";
import { invoiceListPipeline } from "@/lib/invoiceQuery";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

function parseItems(items: any): { description: string; quantity: number; rate: number }[] {
  if (!Array.isArray(items)) return [];
  const valid = items.filter(
    (it: any) => it && typeof it.description === "string" && it.description.trim()
  );
  return valid.map((it: any) => ({
    description: String(it.description).trim(),
    quantity: Number(it.quantity ?? 1) || 1,
    rate: Number(it.rate ?? 0) || 0,
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("invoices.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
    }

    const [invoice] = await Invoice.aggregate(
      invoiceListPipeline({ companyId, invoiceId: id })
    );
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
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

    const existing = await Invoice.findOne({ _id: objectId, companyId });
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const body = await request.json();

    if (
      body.status !== undefined &&
      !(INVOICE_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json(
        { error: `Status must be one of: ${INVOICE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (body.clientId !== undefined && body.clientId) {
      const clientObjectId = toObjectId(body.clientId);
      const client = await Client.findOne({
        _id: clientObjectId,
        companyId,
        deletedAt: null,
      }).lean();
      if (!client) {
        return NextResponse.json(
          { error: "Client not found in your company" },
          { status: 400 }
        );
      }
    }

    if (body.projectId !== undefined && body.projectId) {
      const projectObjectId = toObjectId(body.projectId);
      const project = await Project.findOne({
        _id: projectObjectId,
        companyId,
      }).lean();
      if (!project) {
        return NextResponse.json(
          { error: "Project not found in your company" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, any> = {};
    if (body.invoiceNumber !== undefined && String(body.invoiceNumber).trim()) {
      const finalNumber = String(body.invoiceNumber).trim();
      const dup = await Invoice.findOne({
        companyId,
        invoiceNumber: finalNumber,
        _id: { $ne: objectId },
      }).lean();
      if (dup) {
        return NextResponse.json(
          { error: "An invoice with this number already exists" },
          { status: 409 }
        );
      }
      updateData.invoiceNumber = finalNumber;
    }
    if (body.amount !== undefined || body.tax !== undefined) {
      const newAmount =
        body.amount !== undefined && body.amount !== "" && body.amount !== null
          ? Number(body.amount)
          : existing.amount;
      const newTax =
        body.tax !== undefined && body.tax !== "" && body.tax !== null
          ? Number(body.tax)
          : existing.tax || 0;
      if (Number.isNaN(newAmount) || newAmount < 0) {
        return NextResponse.json(
          { error: "Invoice amount must be a positive number" },
          { status: 400 }
        );
      }
      if (Number.isNaN(newTax) || newTax < 0) {
        return NextResponse.json(
          { error: "Invoice tax must be a positive number" },
          { status: 400 }
        );
      }
      updateData.amount = newAmount;
      updateData.tax = newTax;
      // Never leave paid amount above the new invoice total.
      const total = newAmount + newTax;
      if (existing.paidAmount > total) {
        updateData.paidAmount = total;
      }
    }
    if (body.items !== undefined) {
      updateData.items = parseItems(body.items);
    }
    if (body.projectId !== undefined) {
      updateData.projectId = body.projectId ? toObjectId(body.projectId) : null;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.issueDate !== undefined)
      updateData.issueDate = body.issueDate ? new Date(body.issueDate) : new Date();
    if (body.dueDate !== undefined)
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.notes !== undefined) updateData.notes = body.notes;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    await Invoice.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_INVOICE",
      details: `Updated invoice "${existing.invoiceNumber}"`,
    });

    const [invoice] = await Invoice.aggregate(
      invoiceListPipeline({ companyId, invoiceId: id })
    );

    return NextResponse.json({ invoice });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
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

    await Invoice.findByIdAndDelete(objectId);
    // Remove the invoice's payment ledger too.
    await Payment.deleteMany({ invoiceId: objectId, companyId });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_INVOICE",
      details: `Deleted invoice ${invoice.invoiceNumber}`,
    });

    return NextResponse.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
