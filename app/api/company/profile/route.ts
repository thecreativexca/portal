import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Company from "@/models/Company";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";

export async function GET() {
  try {
    const { companyId } = await requireAuth("company.read");
    await dbConnect();

    const company = await Company.findById(companyId).lean();
    if (!company) {
      return NextResponse.json(
        { error: "Company profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ company });
  } catch (error) {
    return handleApiError(error);
  }
}

const EDITABLE_FIELDS = [
  "name",
  "legalName",
  "businessType",
  "gstNumber",
  "address",
  "city",
  "state",
  "country",
  "contactEmail",
  "contactPhone",
  "logo",
  "timezone",
  "currency",
  "isActive",
] as const;

export async function PATCH(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("company.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const body = await request.json();

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json(
        { error: "Company name cannot be empty" },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const company = await Company.findByIdAndUpdate(companyId, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!company) {
      return NextResponse.json(
        { error: "Company profile not found" },
        { status: 404 }
      );
    }

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "COMPANY_UPDATED",
      details: `Updated company profile fields: ${Object.keys(update).join(", ")}`,
    });

    return NextResponse.json({ company });
  } catch (error) {
    return handleApiError(error);
  }
}
