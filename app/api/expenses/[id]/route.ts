import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Expense, { EXPENSE_CATEGORIES } from "@/models/Expense";
import Project from "@/models/Project";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("expenses.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid expense id" }, { status: 400 });
    }

    const expense = await Expense.findOne({ _id: objectId, companyId })
      .populate("projectId", "projectName")
      .populate("createdBy", "fullName name")
      .lean();
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ expense });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("expenses.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid expense id" }, { status: 400 });
    }

    const existing = await Expense.findOne({ _id: objectId, companyId });
    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const body = await request.json();

    if (
      body.category !== undefined &&
      !(EXPENSE_CATEGORIES as readonly string[]).includes(body.category)
    ) {
      return NextResponse.json(
        { error: `Category must be one of: ${EXPENSE_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    if (body.projectId !== undefined && body.projectId) {
      const projectObjectId = toObjectId(body.projectId);
      const project = await Project.findOne({
        _id: projectObjectId,
        companyId,
      }).lean();
      if (!project) {
        return NextResponse.json(
          { error: "Project not found in your company" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, any> = {};
    if (body.category !== undefined) updateData.category = body.category;
    if (body.amount !== undefined) {
      const amountValue = Number(body.amount);
      if (Number.isNaN(amountValue) || amountValue < 0) {
        return NextResponse.json(
          { error: "Expense amount must be a positive number" },
          { status: 400 }
        );
      }
      updateData.amount = amountValue;
    }
    if (body.date !== undefined) updateData.date = body.date ? new Date(body.date) : new Date();
    if (body.projectId !== undefined) {
      updateData.projectId = body.projectId ? toObjectId(body.projectId) : null;
    }
    if (body.description !== undefined) updateData.description = body.description;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await Expense.findByIdAndUpdate(objectId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("projectId", "projectName")
      .populate("createdBy", "fullName name")
      .lean();

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "UPDATE_EXPENSE",
      details: `Updated expense (${updated!.category})`,
    });

    return NextResponse.json({ expense: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, companyId } = await requireAuth("expenses.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid expense id" }, { status: 400 });
    }

    const expense = await Expense.findOne({ _id: objectId, companyId });
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await Expense.findByIdAndDelete(objectId);

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "DELETE_EXPENSE",
      details: `Deleted expense (${expense.category})`,
    });

    return NextResponse.json({ message: "Expense deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
