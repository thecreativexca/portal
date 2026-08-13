import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Lead, { LEAD_STAGES } from "@/models/Lead";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { validate, reqString, enumValue } from "@/lib/validate";

const SORT_FIELDS = [
  "companyName",
  "estimatedValue",
  "stage",
  "stageChangedAt",
  "createdAt",
  "updatedAt",
];

const OWNER_POPULATE = "fullName name email";

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("crm.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || "1", 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
    );
    const search = searchParams.get("search");
    const stage = searchParams.get("stage");
    const source = searchParams.get("source");
    const owner = searchParams.get("owner");
    let sortBy = searchParams.get("sortBy") || "stageChangedAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;
    if (!SORT_FIELDS.includes(sortBy)) sortBy = "stageChangedAt";

    // Soft-deleted leads are excluded everywhere.
    const query: Record<string, any> = { companyId, deletedAt: null };

    if (stage && (LEAD_STAGES as readonly string[]).includes(stage)) {
      query.stage = stage;
    }
    if (source) {
      query.source = source;
    }
    if (owner && mongoose.Types.ObjectId.isValid(owner)) {
      query.ownerId = owner;
    }
    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [
        { companyName: regex },
        { contactName: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const total = await Lead.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const leads = await Lead.find(query)
      .populate("ownerId", OWNER_POPULATE)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // Distinct sources for the filter dropdowns.
    const sources = await Lead.distinct("source", {
      companyId,
      deletedAt: null,
      source: { $ne: "" },
    });

    return NextResponse.json({
      leads,
      sources,
      pagination: { page, pageSize, total, totalPages },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("crm.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const {
      companyName,
      contactName,
      email,
      phone,
      source,
      estimatedValue,
      stage,
      ownerId,
      notes,
    } = body;

    const err = validate(body, {
      companyName: reqString("Company name"),
      stage: enumValue(LEAD_STAGES, "stage"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    // Owner must belong to the same company.
    if (ownerId) {
      const owner = await User.findOne({
        _id: ownerId,
        companyId,
      }).lean();
      if (!owner) {
        return NextResponse.json(
          { error: "Owner not found in your company" },
          { status: 400 }
        );
      }
    }

    const now = new Date();
    const lead = await Lead.create({
      companyId,
      companyName: String(companyName).trim(),
      contactName,
      email,
      phone,
      source,
      estimatedValue:
        estimatedValue !== undefined && estimatedValue !== null && estimatedValue !== ""
          ? Number(estimatedValue)
          : undefined,
      stage: stage || "lead",
      ownerId,
      notes,
      createdBy: actor._id,
      stageChangedAt: now,
      closedAt:
        stage === "won" || stage === "lost" ? now : null,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_LEAD",
      details: `Created lead "${lead.companyName}"`,
    });

    const populated = await Lead.findById(lead._id)
      .populate("ownerId", OWNER_POPULATE)
      .lean();

    return NextResponse.json({ lead: populated }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
