import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Invoice, { INVOICE_STATUSES } from "@/models/Invoice";
import Client from "@/models/Client";
import Project from "@/models/Project";
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

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("invoices.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");

    if (clientId) {
      const objectId = toObjectId(clientId);
      if (!objectId) {
        return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
      }
      const client = await Client.findOne({
        _id: objectId,
        companyId,
        deletedAt: null,
      }).lean();
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
    }
    if (projectId) {
      const objectId = toObjectId(projectId);
      if (!objectId) {
        return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
      }
      const project = await Project.findOne({ _id: objectId, companyId }).lean();
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }

    const pipeline = invoiceListPipeline({
      companyId,
      clientId,
      projectId,
      status,
    });
    pipeline.push({ $sort: { issueDate: -1, createdAt: -1 } });

    const invoices = await Invoice.aggregate(pipeline);

    return NextResponse.json({ invoices });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("invoices.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const {
      clientId,
      projectId,
      invoiceNumber,
      amount,
      tax,
      items,
      issueDate,
      dueDate,
      status,
      notes,
    } = body;

    if (!clientId) {
      return NextResponse.json(
        { error: "A client is required for the invoice" },
        { status: 400 }
      );
    }
    const clientObjectId = toObjectId(clientId);
    if (!clientObjectId) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

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

    // Optional project link must belong to the company.
    let projectObjectId: mongoose.Types.ObjectId | null = null;
    if (projectId) {
      projectObjectId = toObjectId(projectId);
      if (!projectObjectId) {
        return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
      }
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

    const parsedItems = parseItems(items);
    let amountValue: number;
    if (parsedItems.length > 0) {
      // Derive the subtotal from line items when no explicit amount is given.
      const subtotal = parsedItems.reduce(
        (s, it) => s + it.quantity * it.rate,
        0
      );
      amountValue =
        amount === undefined || amount === null || amount === ""
          ? subtotal
          : Number(amount);
    } else {
      amountValue = Number(amount);
    }
    if (Number.isNaN(amountValue) || amountValue < 0) {
      return NextResponse.json(
        { error: "Invoice amount must be a positive number" },
        { status: 400 }
      );
    }

    const taxValue = tax === undefined || tax === null ? 0 : Number(tax);
    if (Number.isNaN(taxValue) || taxValue < 0) {
      return NextResponse.json(
        { error: "Invoice tax must be a positive number" },
        { status: 400 }
      );
    }

    if (status && !(INVOICE_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${INVOICE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Auto-generate a sequential invoice number if none was provided.
    let finalNumber = invoiceNumber ? String(invoiceNumber).trim() : "";
    if (!finalNumber) {
      const count = await Invoice.countDocuments({ companyId });
      finalNumber = `INV-${String(count + 1).padStart(4, "0")}`;
    }
    const existing = await Invoice.findOne({
      companyId,
      invoiceNumber: finalNumber,
    }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "An invoice with this number already exists" },
        { status: 409 }
      );
    }

    const invoice = await Invoice.create({
      companyId,
      clientId: clientObjectId,
      projectId: projectId && projectObjectId ? projectObjectId : undefined,
      invoiceNumber: finalNumber,
      amount: amountValue,
      tax: taxValue,
      paidAmount: 0,
      status: status || "draft",
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      items: parsedItems,
      notes,
      createdBy: actor._id,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_INVOICE",
      details: `Created invoice ${finalNumber} for ${client.clientName} (${amountValue})`,
    });

    const [created] = await Invoice.aggregate(
      invoiceListPipeline({ companyId, invoiceId: invoice._id.toString() })
    );

    return NextResponse.json({ invoice: created }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
