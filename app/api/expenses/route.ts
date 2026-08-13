import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Expense, { EXPENSE_CATEGORIES } from "@/models/Expense";
import Project from "@/models/Project";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { ok, parsePagination, paginationMeta } from "@/lib/api";
import { toObjectId, toObjectIdOrNull } from "@/lib/ids";

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("expenses.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const category = searchParams.get("category");
    const projectId = searchParams.get("projectId");
    const search = searchParams.get("search");
    const { page, pageSize, skip } = parsePagination(request.url, 50);

    const match: Record<string, any> = {
      companyId: new mongoose.Types.ObjectId(companyId),
    };
    if (from) {
      const d = new Date(from);
      d.setHours(0, 0, 0, 0);
      match.date = { ...(match.date || {}), $gte: d };
    }
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      match.date = { ...(match.date || {}), $lte: d };
    }
    if (category) match.category = category;
    if (projectId) {
      const pid = toObjectIdOrNull(projectId);
      if (pid) match.projectId = pid;
    }
    if (search) {
      match.description = { $regex: search, $options: "i" };
    }

    // Summary computed via aggregation.
    const summaryAgg = await Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: "$amount" },
          avg: { $avg: "$amount" },
          min: { $min: "$amount" },
          max: { $max: "$amount" },
        },
      },
    ]);
    const byCategory = await Expense.aggregate([
      { $match: match },
      { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const [expenses, total] = await Promise.all([
      Expense.find(match)
        .populate("projectId", "projectName")
        .populate("createdBy", "fullName name")
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Expense.countDocuments(match),
    ]);

    return ok(
      {
        expenses,
        summary: summaryAgg[0] || { count: 0, total: 0, avg: 0, min: 0, max: 0 },
        byCategory,
      },
      paginationMeta(total, page, pageSize)
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor, companyId } = await requireAuth("expenses.write");
    rateLimitByUser(actor._id.toString());
    await dbConnect();

    const body = await request.json();
    const { category, amount, date, projectId, description } = body;

    if (!category || !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${EXPENSE_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (amount === undefined || amount === null || amount === "") {
      return NextResponse.json(
        { error: "Expense amount is required" },
        { status: 400 }
      );
    }
    const amountValue = Number(amount);
    if (Number.isNaN(amountValue) || amountValue < 0) {
      return NextResponse.json(
        { error: "Expense amount must be a positive number" },
        { status: 400 }
      );
    }
    if (!date) {
      return NextResponse.json({ error: "Expense date is required" }, { status: 400 });
    }

    let projectObjectId: mongoose.Types.ObjectId | null = null;
    if (projectId) {
      projectObjectId = toObjectId(projectId);
      if (!projectObjectId) {
        return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
      }
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

    const expense = await Expense.create({
      companyId,
      category,
      amount: amountValue,
      date: new Date(date),
      projectId: projectId && projectObjectId ? projectObjectId : undefined,
      description: description || "",
      createdBy: actor._id,
    });

    await logActivity({
      userId: actor._id.toString(),
      companyId,
      action: "CREATE_EXPENSE",
      details: `${actor.fullName || actor.name || "Someone"} recorded a ${category} expense of ${amountValue}`,
    });

    const populated = await Expense.findById(expense._id)
      .populate("projectId", "projectName")
      .populate("createdBy", "fullName name")
      .lean();

    return NextResponse.json({ expense: populated }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
