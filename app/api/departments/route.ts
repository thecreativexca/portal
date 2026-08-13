import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Department from "@/models/Department";
import User from "@/models/User";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { validate, reqString } from "@/lib/validate";

export async function GET() {
  try {
    const { companyId } = await requireAuth("departments.read");
    await dbConnect();

    const departments = await Department.find({ companyId })
      .populate("managerId", "fullName name email")
      .sort({ name: 1 })
      .lean();

    // Include a member count per department.
    const counts = await User.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          departmentId: { $ne: null },
        },
      },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      counts.map((c) => [c._id.toString(), c.count])
    );

    const result = departments.map((d) => ({
      ...d,
      memberCount: countMap.get(d._id.toString()) || 0,
    }));

    return NextResponse.json({ departments: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("departments.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const { name, description, managerId } = body;

    const err = validate(body, {
      name: reqString("Department name"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    if (managerId) {
      const manager = await User.findOne({
        _id: managerId,
        companyId,
      }).lean();
      if (!manager) {
        return NextResponse.json(
          { error: "Manager not found in your company" },
          { status: 400 }
        );
      }
    }

    const existing = await Department.findOne({
      companyId,
      name: String(name).trim(),
    }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "A department with this name already exists" },
        { status: 409 }
      );
    }

    const department = await Department.create({
      companyId,
      name: String(name).trim(),
      description,
      managerId,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_DEPARTMENT",
      details: `Created department ${department.name}`,
    });

    return NextResponse.json({ department }, { status: 201 });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "A department with this name already exists" },
        { status: 409 }
      );
    }
    return handleApiError(error);
  }
}
