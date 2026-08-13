import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import User, { IUser } from "@/models/User";
import Department from "@/models/Department";
import { requireAuth, handleApiError, isDuplicateKeyError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { ROLE_KEYS } from "@/models/Role";
import { ok, parsePagination, paginationMeta } from "@/lib/api";
import { validate, reqString, email as emailValidator, enumValue } from "@/lib/validate";

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("users.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const departmentId = searchParams.get("departmentId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const { page, pageSize, skip } = parsePagination(request.url, 50);

    const query: mongoose.QueryFilter<IUser> = { companyId };

    if (role && ROLE_KEYS.includes(role as (typeof ROLE_KEYS)[number])) {
      query.role = role as (typeof ROLE_KEYS)[number];
    }
    if (departmentId) {
      query.departmentId = departmentId;
    }
    if (status && ["active", "inactive"].includes(status)) {
      query.status = status as "active" | "inactive";
    }
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .populate("departmentId", "name")
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments(query),
    ]);

    return ok({ users }, paginationMeta(total, page, pageSize));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("users.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const {
      fullName,
      email,
      password,
      phone,
      role,
      departmentId,
      designation,
      employeeId,
      joiningDate,
      salary,
      status,
      profileImage,
    } = body;

    const err = validate(body, {
      fullName: reqString("Full name"),
      email: emailValidator(),
      password: reqString("Password"),
      role: enumValue(ROLE_KEYS, "role"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    if (typeof password === "string" && password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // No privilege escalation: only the existing CEO may hold the CEO role.
    if (role === "ceo") {
      return NextResponse.json(
        { error: "The CEO role is reserved for the company owner" },
        { status: 400 }
      );
    }

    // Department (if provided) must belong to the same company.
    if (departmentId) {
      const department = await Department.findOne({
        _id: departmentId,
        companyId,
      }).lean();
      if (!department) {
        return NextResponse.json(
          { error: "Department not found in your company" },
          { status: 400 }
        );
      }
    }

    const existingUser = await User.findOne({ companyId, email });
    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const newUser = await User.create({
      companyId,
      fullName,
      name: fullName,
      email,
      password,
      phone,
      role: role || "employee",
      departmentId,
      designation,
      employeeId,
      joiningDate: joiningDate ? new Date(joiningDate) : undefined,
      salary: salary !== undefined && salary !== null && salary !== "" ? Number(salary) : undefined,
      status: status || "active",
      profileImage,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_USER",
      details: `Created user ${fullName} (${email}) with role ${newUser.role}`,
    });

    const populated = await User.findById(newUser._id)
      .populate("departmentId", "name")
      .select("-password")
      .lean();

    return NextResponse.json({ user: populated }, { status: 201 });
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
