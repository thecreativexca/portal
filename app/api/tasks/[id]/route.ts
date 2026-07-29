import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const role = (session.user as any).role;
    const userId = (session.user as any).id;
    const { id } = await params;
    const body = await request.json();

    const task = await Task.findById(id);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Only assigned user, CEO, or Manager can update
    const isAssigned = task.assignedTo.toString() === userId;
    const isCeo = role === "ceo";
    const isManager = role === "manager";

    if (!isAssigned && !isCeo && !isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: Record<string, any> = {};

    // Assignee can update status
    if (isAssigned && body.status) {
      updateData.status = body.status;
    }

    // CEO/Manager can update everything
    if (isCeo || isManager) {
      if (body.title) updateData.title = body.title;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.status) updateData.status = body.status;
      if (body.assignedTo) updateData.assignedTo = body.assignedTo;
      if (body.priority) updateData.priority = body.priority;
      if (body.dueDate) updateData.dueDate = new Date(body.dueDate);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await Task.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .populate("projectId", "title")
      .populate("comments.userId", "name email")
      .lean();

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}