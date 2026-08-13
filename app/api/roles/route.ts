import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Role from "@/models/Role";
import User from "@/models/User";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { PERMISSION_CATALOG } from "@/lib/permissions";
import { validate, reqString } from "@/lib/validate";

const VALID_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key));

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function GET() {
  try {
    const { companyId } = await requireAuth("roles.read");
    await dbConnect();

    const roles = await Role.find({ companyId }).sort({ name: 1 }).lean();

    // Attach a member count per role key.
    const counts = await User.aggregate([
      { $match: { companyId } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id, c.count]));

    const result = roles.map((r) => ({
      ...r,
      userCount: countMap.get(r.key) || 0,
    }));

    return NextResponse.json({ roles: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("roles.write");
    await dbConnect();

    const body = await request.json();
    const { name, key, description, permissions } = body;

    const err = validate(body, {
      name: reqString("Role name"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const roleKey = key ? slugify(key) : slugify(String(name));
    if (!roleKey) {
      return NextResponse.json(
        { error: "A valid role key is required" },
        { status: 400 }
      );
    }

    const granted = Array.isArray(permissions) ? permissions : [];
    const invalid = granted.filter((p: string) => !VALID_KEYS.has(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown permissions: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }

    const existing = await Role.findOne({ companyId, key: roleKey }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "A role with this key already exists" },
        { status: 409 }
      );
    }

    const role = await Role.create({
      companyId,
      name: String(name).trim(),
      key: roleKey,
      description,
      permissions: granted,
      isSystem: false,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_ROLE",
      details: `Created role ${role.name} (${role.key})`,
    });

    return NextResponse.json({ role }, { status: 201 });
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
