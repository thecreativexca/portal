import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Role from "@/models/Role";
import User from "@/models/User";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { logActivity } from "@/lib/logActivity";
import { PERMISSION_CATALOG } from "@/lib/permissions";
import { toObjectId } from "@/lib/ids";
import { RoleKey } from "@/models/Role";

const VALID_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key));

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("roles.read");
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
    }

    await dbConnect();
    const role = await Role.findOne({ _id: objectId, companyId }).lean();
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({ role });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("roles.write");
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
    }

    await dbConnect();
    const body = await request.json();

    const target = await Role.findOne({ _id: objectId, companyId });
    if (!target) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    // System role keys are fixed — users reference them by key.
    if (target.isSystem && body.key && body.key !== target.key) {
      return NextResponse.json(
        { error: "The key of a system role cannot be changed" },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        return NextResponse.json(
          { error: "Role name cannot be empty" },
          { status: 400 }
        );
      }
      update.name = String(body.name).trim();
    }
    if (body.description !== undefined) update.description = body.description;

    if (body.key !== undefined && !target.isSystem) {
      const roleKey = String(body.key).toLowerCase().trim();
      if (!roleKey) {
        return NextResponse.json(
          { error: "Role key cannot be empty" },
          { status: 400 }
        );
      }
      const dup = await Role.findOne({
        companyId,
        key: roleKey,
        _id: { $ne: objectId },
      }).lean();
      if (dup) {
        return NextResponse.json(
          { error: "A role with this key already exists" },
          { status: 409 }
        );
      }
      update.key = roleKey;
    }

    if (body.permissions !== undefined) {
      const granted = Array.isArray(body.permissions) ? body.permissions : [];
      const invalid = granted.filter((p: string) => !VALID_KEYS.has(p));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Unknown permissions: ${invalid.join(", ")}` },
          { status: 400 }
        );
      }
      update.permissions = granted;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await Role.findByIdAndUpdate(objectId, update, {
      new: true,
      runValidators: true,
    }).lean();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_ROLE",
      details: `Updated role ${updated!.name} (${updated!.key})`,
    });

    return NextResponse.json({ role: updated });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "A role with this key already exists" },
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
    const { user: actor, companyId } = await requireAuth("roles.write");
    const { id } = await params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
    }

    await dbConnect();
    const target = await Role.findOne({ _id: objectId, companyId });
    if (!target) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (target.isSystem) {
      return NextResponse.json(
        { error: "System roles cannot be deleted" },
        { status: 400 }
      );
    }

    // target.key may be a custom role key (a string) not in the system union,
    // so it is cast to the user's role type for the query.
    const inUse = await User.countDocuments({
      companyId,
      role: target.key as RoleKey,
    });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `This role is assigned to ${inUse} user(s); reassign them first` },
        { status: 400 }
      );
    }

    await Role.findByIdAndDelete(objectId);

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_ROLE",
      details: `Deleted role ${target.name} (${target.key})`,
    });

    return NextResponse.json({ message: "Role deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
