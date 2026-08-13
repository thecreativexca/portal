import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Payroll, {
  PAYROLL_PAYMENT_STATUSES,
  payrollNetSalary,
} from "@/models/Payroll";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { notifyUser } from "@/lib/notify";
import { toObjectId } from "@/lib/ids";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("payroll.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid payroll id" }, { status: 400 });
    }

    const record = await Payroll.findOne({ _id: objectId, companyId })
      .populate("userId", "fullName name email designation employeeId role")
      .populate("createdBy", "fullName name")
      .lean();
    if (!record) {
      return NextResponse.json({ error: "Payroll record not found" }, { status: 404 });
    }

    return NextResponse.json({ record });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("payroll.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid payroll id" }, { status: 400 });
    }

    const existing = await Payroll.findOne({ _id: objectId, companyId });
    if (!existing) {
      return NextResponse.json({ error: "Payroll record not found" }, { status: 404 });
    }

    const body = await request.json();

    if (
      body.paymentStatus !== undefined &&
      !(PAYROLL_PAYMENT_STATUSES as readonly string[]).includes(body.paymentStatus)
    ) {
      return NextResponse.json(
        { error: `Status must be one of: ${PAYROLL_PAYMENT_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};
    if (body.basicSalary !== undefined) {
      const v = Number(body.basicSalary) || 0;
      if (v < 0) {
        return NextResponse.json({ error: "Basic salary cannot be negative" }, { status: 400 });
      }
      updateData.basicSalary = v;
    }
    if (body.bonus !== undefined) {
      const v = Number(body.bonus) || 0;
      if (v < 0) {
        return NextResponse.json({ error: "Bonus cannot be negative" }, { status: 400 });
      }
      updateData.bonus = v;
    }
    if (body.deduction !== undefined) {
      const v = Number(body.deduction) || 0;
      if (v < 0) {
        return NextResponse.json({ error: "Deduction cannot be negative" }, { status: 400 });
      }
      updateData.deduction = v;
    }
    if (body.paymentStatus !== undefined) {
      updateData.paymentStatus = body.paymentStatus;
      updateData.paidAt =
        body.paymentStatus === "paid"
          ? existing.paidAt || new Date()
          : null;
    }

    // Always keep net salary in sync with the components.
    const basic = updateData.basicSalary ?? existing.basicSalary;
    const bonus = updateData.bonus ?? existing.bonus;
    const deduction = updateData.deduction ?? existing.deduction;
    updateData.netSalary = payrollNetSalary(basic, bonus, deduction);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await Payroll.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("userId", "fullName name email designation employeeId role")
      .lean();

    if (
      body.paymentStatus === "paid" &&
      existing.paymentStatus !== "paid"
    ) {
      await notifyUser({
        companyId,
        userId: existing.userId.toString(),
        title: "Salary paid",
        message: `Your salary for ${existing.month} has been marked as paid`,
        type: "payroll",
        link: "/payroll",
      });
    }

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_PAYROLL",
      details: `Updated payroll for ${existing.month}`,
    });

    return NextResponse.json({ record: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("payroll.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid payroll id" }, { status: 400 });
    }

    const record = await Payroll.findOne({ _id: objectId, companyId });
    if (!record) {
      return NextResponse.json({ error: "Payroll record not found" }, { status: 404 });
    }

    await Payroll.findByIdAndDelete(objectId);

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_PAYROLL",
      details: `Deleted payroll for ${record.month}`,
    });

    return NextResponse.json({ message: "Payroll record deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
