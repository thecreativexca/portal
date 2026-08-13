import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Department from "@/models/Department";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";
import { ROLE_KEYS } from "@/models/Role";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("users.read");
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    await dbConnect();
    const user = await User.findOne({ _id: objectId, companyId })
      .populate("departmentId", "name")
      .select("-password")
      .lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

async function updateUser(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("users.write");
    rateLimitByUser(actor._id.toString());
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    await dbConnect();
    const body = await request.json();

    const target = await User.findOne({ _id: objectId, companyId });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Protect the CEO account.
    if (target.role === "ceo") {
      if (body.role && body.role !== "ceo") {
        return NextResponse.json(
          { error: "Cannot change the CEO role" },
          { status: 400 }
        );
      }
      if (body.status === "inactive") {
        return NextResponse.json(
          { error: "Cannot deactivate the CEO account" },
          { status: 400 }
        );
      }
    }

    // No privilege escalation to CEO.
    if (body.role === "ceo") {
      return NextResponse.json(
        { error: "The CEO role is reserved for the company owner" },
        { status: 400 }
      );
    }

    if (body.role && !ROLE_KEYS.includes(body.role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${ROLE_KEYS.join(", ")}` },
        { status: 400 }
      );
    }

    if (body.email && body.email.toLowerCase() !== target.email) {
      const existing = await User.findOne({
        companyId,
        email: body.email,
        _id: { $ne: objectId },
      });
      if (existing) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        );
      }
    }

    if (body.departmentId) {
      const department = await Department.findOne({
        _id: body.departmentId,
        companyId,
      }).lean();
      if (!department) {
        return NextResponse.json(
          { error: "Department not found in your company" },
          { status: 400 }
        );
      }
    }

    const update: Record<string, unknown> = {};
    const textFields = [
      "fullName",
      "email",
      "phone",
      "designation",
      "employeeId",
      "profileImage",
    ];
    for (const field of textFields) {
      if (body[field] !== undefined) update[field] = body[field];
    }
    // Keep the display alias in sync when fullName changes.
    if (body.fullName !== undefined) update.name = body.fullName;

    if (body.role !== undefined) update.role = body.role;
    if (body.status !== undefined) {
      if (!["active", "inactive"].includes(body.status)) {
        return NextResponse.json(
          { error: "Status must be active or inactive" },
          { status: 400 }
        );
      }
      update.status = body.status;
    }
    if (body.departmentId !== undefined) update.departmentId = body.departmentId;
    if (body.joiningDate !== undefined) {
      update.joiningDate = body.joiningDate ? new Date(body.joiningDate) : null;
    }
    if (body.salary !== undefined) {
      const salary =
        body.salary === "" || body.salary === null ? null : Number(body.salary);
      if (salary !== null && (isNaN(salary) || salary < 0)) {
        return NextResponse.json(
          { error: "Salary must be a non-negative number" },
          { status: 400 }
        );
      }
      update.salary = salary;
    }

    if (body.password) {
      if (String(body.password).length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        );
      }
      const salt = await bcrypt.genSalt(12);
      update.password = await bcrypt.hash(body.password, salt);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await User.findByIdAndUpdate(objectId, update, {
      new: true,
      runValidators: true,
    })
      .populate("departmentId", "name")
      .select("-password")
      .lean();

    const changes = Object.keys(update)
      .filter((k) => k !== "password" && k !== "name")
      .join(", ");

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_USER",
      details: `Updated user ${updated!.fullName}: ${changes}`,
    });

    return NextResponse.json({ user: updated });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateUser(request, context);
}

// Legacy alias kept so existing callers using PUT keep working.
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateUser(request, context);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("users.write");
    rateLimitByUser(actor._id.toString());
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    await dbConnect();
    const target = await User.findOne({ _id: objectId, companyId });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role === "ceo") {
      return NextResponse.json(
        { error: "Cannot delete the CEO account" },
        { status: 400 }
      );
    }

    if (target._id.toString() === actor._id.toString()) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    await User.findByIdAndDelete(objectId);

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_USER",
      details: `Deleted user ${target.fullName} (${target.email})`,
    });

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
