import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Opportunity, { PROPOSAL_STATUSES } from "@/models/Opportunity";
import Lead, { LEAD_STAGES } from "@/models/Lead";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { validate, reqString, enumValue } from "@/lib/validate";

const SORT_FIELDS = [
  "opportunityName",
  "value",
  "stage",
  "expectedCloseDate",
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
    const owner = searchParams.get("owner");
    const proposalStatus = searchParams.get("proposalStatus");
    let sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;
    if (!SORT_FIELDS.includes(sortBy)) sortBy = "createdAt";

    const query: Record<string, any> = { companyId, deletedAt: null };

    if (stage && (LEAD_STAGES as readonly string[]).includes(stage)) {
      query.stage = stage;
    }
    if (owner && mongoose.Types.ObjectId.isValid(owner)) {
      query.ownerId = owner;
    }
    if (
      proposalStatus &&
      (PROPOSAL_STATUSES as readonly string[]).includes(proposalStatus)
    ) {
      query["proposal.status"] = proposalStatus;
    }
    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [{ opportunityName: regex }, { "lead.companyName": regex }];
    }

    const total = await Opportunity.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const opportunities = await Opportunity.find(query)
      .populate("ownerId", OWNER_POPULATE)
      .populate("leadId", "companyName contactName email")
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    return NextResponse.json({
      opportunities,
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
      leadId,
      opportunityName,
      value,
      expectedCloseDate,
      probability,
      stage,
      proposal,
      ownerId,
      notes,
    } = body;

    const err = validate(body, {
      opportunityName: reqString("Opportunity name"),
      stage: enumValue(LEAD_STAGES, "stage"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    if (
      proposal?.status &&
      !(PROPOSAL_STATUSES as readonly string[]).includes(proposal.status)
    ) {
      return NextResponse.json(
        { error: `Proposal status must be one of: ${PROPOSAL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Owner must belong to the same company.
    if (ownerId) {
      const owner = await User.findOne({ _id: ownerId, companyId }).lean();
      if (!owner) {
        return NextResponse.json(
          { error: "Owner not found in your company" },
          { status: 400 }
        );
      }
    }

    // If a lead is referenced it must exist and belong to the company.
    let convertedLead = null;
    if (leadId) {
      convertedLead = await Lead.findOne({
        _id: leadId,
        companyId,
        deletedAt: null,
      });
      if (!convertedLead) {
        return NextResponse.json(
          { error: "Lead not found in your company" },
          { status: 400 }
        );
      }
    }

    // When created from a lead, inherit the lead's pipeline position unless an
    // explicit stage was given (matches the /leads/[id]/convert endpoint).
    const defaultStage = convertedLead
      ? convertedLead.stage === "lead"
        ? "qualified"
        : convertedLead.stage
      : "qualified";

    const opportunity = await Opportunity.create({
      companyId,
      leadId,
      opportunityName: String(opportunityName).trim(),
      value:
        value !== undefined && value !== null && value !== ""
          ? Number(value)
          : undefined,
      expectedCloseDate: expectedCloseDate
        ? new Date(expectedCloseDate)
        : undefined,
      probability:
        probability !== undefined && probability !== null
          ? Math.min(100, Math.max(0, Number(probability)))
          : 0,
      stage: stage || defaultStage,
      proposal: {
        sentAt: proposal?.sentAt ? new Date(proposal.sentAt) : undefined,
        dueAt: proposal?.dueAt ? new Date(proposal.dueAt) : undefined,
        status: proposal?.status || "draft",
      },
      ownerId,
      notes,
      createdBy: actor._id,
      timeline: [
        {
          type: "created",
          title: "Opportunity created",
          description: `New opportunity "${String(opportunityName).trim()}"`,
          userId: actor._id,
          at: new Date(),
        },
      ],
    });

    // Mark the source lead as converted so the profile reflects the link.
    if (convertedLead && !convertedLead.convertedAt) {
      convertedLead.convertedAt = new Date();
      await convertedLead.save();
    }

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_OPPORTUNITY",
      details: `Created opportunity "${opportunity.opportunityName}"`,
    });

    const populated = await Opportunity.findById(opportunity._id)
      .populate("ownerId", OWNER_POPULATE)
      .populate("leadId", "companyName contactName email")
      .lean();

    return NextResponse.json({ opportunity: populated }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
