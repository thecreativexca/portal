import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Department from "@/models/Department";
import User from "@/models/User";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("departments.read");
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json(
        { error: "Invalid department id" },
        { status: 400 }
      );
    }

    await dbConnect();
    const department = await Department.findOne({
      _id: objectId,
      companyId,
    })
      .populate("managerId", "fullName name email")
      .lean();

    if (!department) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ department });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("departments.write");
    rateLimitByUser(actor._id.toString());
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json(
        { error: "Invalid department id" },
        { status: 400 }
      );
    }

    await dbConnect();
    const body = await request.json();

    const target = await Department.findOne({ _id: objectId, companyId });
    if (!target) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        return NextResponse.json(
          { error: "Department name cannot be empty" },
          { status: 400 }
        );
      }
      const dup = await Department.findOne({
        companyId,
        name: String(body.name).trim(),
        _id: { $ne: objectId },
      }).lean();
      if (dup) {
        return NextResponse.json(
          { error: "A department with this name already exists" },
          { status: 409 }
        );
      }
      update.name = String(body.name).trim();
    }
    if (body.description !== undefined) update.description = body.description;
    if (body.isActive !== undefined) update.isActive = !!body.isActive;
    if (body.managerId !== undefined) {
      if (body.managerId) {
        const manager = await User.findOne({
          _id: body.managerId,
          companyId,
        }).lean();
        if (!manager) {
          return NextResponse.json(
            { error: "Manager not found in your company" },
            { status: 400 }
          );
        }
      }
      update.managerId = body.managerId || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await Department.findByIdAndUpdate(objectId, update, {
      new: true,
      runValidators: true,
    })
      .populate("managerId", "fullName name email")
      .lean();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_DEPARTMENT",
      details: `Updated department ${updated!.name}`,
    });

    return NextResponse.json({ department: updated });
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("departments.write");
    rateLimitByUser(actor._id.toString());
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json(
        { error: "Invalid department id" },
        { status: 400 }
      );
    }

    await dbConnect();
    const target = await Department.findOne({ _id: objectId, companyId });
    if (!target) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    // Unassign members before removing the department.
    await User.updateMany(
      { companyId, departmentId: objectId },
      { $set: { departmentId: null } }
    );

    await Department.findByIdAndDelete(objectId);

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_DEPARTMENT",
      details: `Deleted department ${target.name}`,
    });

    return NextResponse.json({ message: "Department deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
