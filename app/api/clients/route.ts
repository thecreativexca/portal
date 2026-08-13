import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Client, { CLIENT_STATUSES } from "@/models/Client";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { validate, reqString, enumValue } from "@/lib/validate";

const SORT_FIELDS = [
  "clientName",
  "contractValue",
  "status",
  "createdAt",
  "updatedAt",
];

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("clients.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || "1", 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10) || 10)
    );
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const accountManager = searchParams.get("accountManager");
    let sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;
    if (!SORT_FIELDS.includes(sortBy)) sortBy = "createdAt";

    // Soft-deleted clients are excluded everywhere.
    const query: Record<string, any> = { companyId, deletedAt: null };

    if (status && (CLIENT_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }
    if (accountManager && mongoose.Types.ObjectId.isValid(accountManager)) {
      query.accountManagerId = accountManager;
    }
    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [
        { clientName: regex },
        { legalName: regex },
        { primaryContactName: regex },
        { primaryContactEmail: regex },
        { industry: regex },
        { city: regex },
        { gstNumber: regex },
      ];
    }

    const total = await Client.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const clients = await Client.find(query)
      .populate("accountManagerId", "fullName name email")
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    return NextResponse.json({
      clients,
      pagination: { page, pageSize, total, totalPages },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("clients.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const {
      clientName,
      legalName,
      industry,
      website,
      gstNumber,
      address,
      city,
      state,
      country,
      primaryContactName,
      primaryContactEmail,
      primaryContactPhone,
      accountManagerId,
      contractValue,
      contractStartDate,
      contractEndDate,
      renewalDate,
      status,
      notes,
    } = body;

    const err = validate(body, {
      clientName: reqString("Client name"),
      status: enumValue(CLIENT_STATUSES, "status"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    // Account manager must belong to the same company.
    if (accountManagerId) {
      const manager = await User.findOne({
        _id: accountManagerId,
        companyId,
      }).lean();
      if (!manager) {
        return NextResponse.json(
          { error: "Account manager not found in your company" },
          { status: 400 }
        );
      }
    }

    const client = await Client.create({
      companyId,
      clientName: String(clientName).trim(),
      legalName,
      industry,
      website,
      gstNumber,
      address,
      city,
      state,
      country,
      primaryContactName,
      primaryContactEmail,
      primaryContactPhone,
      accountManagerId,
      contractValue:
        contractValue !== undefined && contractValue !== null && contractValue !== ""
          ? Number(contractValue)
          : undefined,
      contractStartDate: contractStartDate ? new Date(contractStartDate) : undefined,
      contractEndDate: contractEndDate ? new Date(contractEndDate) : undefined,
      renewalDate: renewalDate ? new Date(renewalDate) : undefined,
      status: status || "lead",
      notes,
      createdBy: actor._id,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_CLIENT",
      details: `Created client "${client.clientName}"`,
    });

    const populated = await Client.findById(client._id)
      .populate("accountManagerId", "fullName name email")
      .lean();

    return NextResponse.json({ client: populated }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
