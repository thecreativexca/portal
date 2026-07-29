import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const { id } = await params;
    const body = await request.json();

    if (!body.text || !body.text.trim()) {
      return NextResponse.json(
        { error: "Comment text is required" },
        { status: 400 }
      );
    }

    const task = await Task.findById(id);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    task.comments.push({
      userId: (session.user as any).id,
      text: body.text.trim(),
      timestamp: new Date(),
    });

    await task.save();

    const updated = await Task.findById(id)
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .populate("projectId", "title")
      .populate("comments.userId", "name email")
      .lean();

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("Error adding comment:", error);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 }
    );
  }
}