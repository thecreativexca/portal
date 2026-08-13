import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Client, { CLIENT_STATUSES } from "@/models/Client";
import Project from "@/models/Project";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

/** Editable client fields (whitelist for PATCH). */
const EDITABLE_FIELDS = [
  "clientName",
  "legalName",
  "industry",
  "website",
  "gstNumber",
  "address",
  "city",
  "state",
  "country",
  "primaryContactName",
  "primaryContactEmail",
  "primaryContactPhone",
  "accountManagerId",
  "contractValue",
  "contractStartDate",
  "contractEndDate",
  "renewalDate",
  "status",
  "notes",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("clients.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const client = await Client.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    })
      .populate("accountManagerId", "fullName name email")
      .populate("createdBy", "fullName name email")
      .lean();

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Live aggregates: linked projects + invoice/payment totals.
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const [projectsCount, invoiceAgg, paymentAgg] = await Promise.all([
      Project.countDocuments({ companyId, clientId: objectId }),
      Invoice.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            clientId: objectId,
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalInvoiced: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "cancelled"] },
                  0,
                  { $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }] },
                ],
              },
            },
          },
        },
      ]),
      // Payments now live in their own collection — aggregate via the invoice link.
      Payment.aggregate([
        {
          $lookup: {
            from: "invoices",
            localField: "invoiceId",
            foreignField: "_id",
            as: "_invoice",
          },
        },
        { $unwind: "$_invoice" },
        {
          $match: {
            "_invoice.companyId": companyObjectId,
            "_invoice.clientId": objectId,
            "_invoice.status": { $ne: "cancelled" },
          },
        },
        { $group: { _id: null, totalPaid: { $sum: "$amount" } } },
      ]),
    ]);

    const agg = invoiceAgg[0] || { count: 0, totalInvoiced: 0 };
    const totalInvoiced = agg.totalInvoiced || 0;
    const totalPaid = paymentAgg[0]?.totalPaid || 0;

    const stats = {
      projectsCount,
      invoicesCount: agg.count || 0,
      totalInvoiced,
      totalPaid,
      outstanding: Math.max(0, totalInvoiced - totalPaid),
    };

    return NextResponse.json({ client, stats });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("clients.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const existing = await Client.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = await request.json();

    if (
      body.status !== undefined &&
      !(CLIENT_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json(
        { error: `Status must be one of: ${CLIENT_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (body.accountManagerId) {
      const manager = await User.findOne({
        _id: body.accountManagerId,
        companyId,
      }).lean();
      if (!manager) {
        return NextResponse.json(
          { error: "Account manager not found in your company" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      if (field === "clientName" && !String(body[field]).trim()) {
        return NextResponse.json(
          { error: "Client name is required" },
          { status: 400 }
        );
      }
      if (field === "contractValue") {
        updateData[field] =
          body[field] === "" || body[field] === null
            ? null
            : Number(body[field]);
        continue;
      }
      if (
        field === "contractStartDate" ||
        field === "contractEndDate" ||
        field === "renewalDate"
      ) {
        updateData[field] = body[field] ? new Date(body[field]) : null;
        continue;
      }
      if (field === "accountManagerId" && !body[field]) {
        updateData[field] = null;
        continue;
      }
      updateData[field] = body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await Client.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("accountManagerId", "fullName name email")
      .lean();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_CLIENT",
      details: `Updated client "${updated!.clientName}"`,
    });

    return NextResponse.json({ client: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("clients.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const client = await Client.findOne({
      _id: objectId,
      companyId,
      deletedAt: null,
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Soft delete: keep the record (and its projects/invoices) for the audit trail.
    client.deletedAt = new Date();
    await client.save();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_CLIENT",
      details: `Deleted client "${client.clientName}"`,
    });

    return NextResponse.json({ message: "Client deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
