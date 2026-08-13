import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Settings from "@/models/Settings";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";

export async function GET() {
  try {
    const { companyId } = await requireAuth("company.read");
    await dbConnect();

    let settings = await Settings.findOne({ companyId }).lean();
    if (!settings) {
      settings = await Settings.create({ companyId });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("company.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const body = await request.json();

    let settings = await Settings.findOne({ companyId });
    if (!settings) {
      settings = await Settings.create({ companyId, ...body });
    } else {
      if (body.companyName !== undefined)
        settings.companyName = body.companyName;
      if (body.workingHours) {
        if (body.workingHours.start !== undefined)
          settings.workingHours.start = body.workingHours.start;
        if (body.workingHours.end !== undefined)
          settings.workingHours.end = body.workingHours.end;
        settings.markModified("workingHours");
      }
      if (body.workingDays) {
        settings.workingDays = body.workingDays;
        settings.markModified("workingDays");
      }
      if (body.leavePolicy) {
        if (body.leavePolicy.annualLeaves !== undefined)
          settings.leavePolicy.annualLeaves = body.leavePolicy.annualLeaves;
        if (body.leavePolicy.sickLeaves !== undefined)
          settings.leavePolicy.sickLeaves = body.leavePolicy.sickLeaves;
        if (body.leavePolicy.carryForward !== undefined)
          settings.leavePolicy.carryForward = body.leavePolicy.carryForward;
        settings.markModified("leavePolicy");
      }
      await settings.save();
    }

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "SETTINGS_UPDATED",
      details: "Updated company settings",
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}
