import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Settings from "@/models/Settings";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ceo") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    let settings = await Settings.findOne().lean();
    if (!settings) {
      settings = await Settings.create({});
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ceo") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await request.json();

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create(body);
    } else {
      if (body.companyName !== undefined) settings.companyName = body.companyName;
      if (body.workingHours) {
        if (body.workingHours.start !== undefined) settings.workingHours.start = body.workingHours.start;
        if (body.workingHours.end !== undefined) settings.workingHours.end = body.workingHours.end;
        settings.markModified("workingHours");
      }
      if (body.workingDays) {
        settings.workingDays = body.workingDays;
        settings.markModified("workingDays");
      }
      if (body.leavePolicy) {
        if (body.leavePolicy.annualLeaves !== undefined) settings.leavePolicy.annualLeaves = body.leavePolicy.annualLeaves;
        if (body.leavePolicy.sickLeaves !== undefined) settings.leavePolicy.sickLeaves = body.leavePolicy.sickLeaves;
        if (body.leavePolicy.carryForward !== undefined) settings.leavePolicy.carryForward = body.leavePolicy.carryForward;
        settings.markModified("leavePolicy");
      }
      await settings.save();
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}