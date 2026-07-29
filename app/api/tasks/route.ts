import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Task from "@/models/Task";
import Project from "@/models/Project";
import { logActivity } from "@/lib/logActivity";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const role = (session.user as any).role;
    const userId = (session.user as any).id;
    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get("projectId");
    const assignedTo = searchParams.get("userId");
    const status = searchParams.get("status");

    const query: Record<string, any> = {};

    if (projectId) query.projectId = projectId;
    if (status) query.status = status;

    if (role === "employee") {
      query.assignedTo = userId;
    } else if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .populate("projectId", "title status")
      .populate("comments.userId", "name email")
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "ceo" && role !== "manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { projectId, title, description, assignedTo, priority, dueDate } = body;

    if (!projectId || !title || !assignedTo) {
      return NextResponse.json(
        { error: "Project, title, and assignee are required" },
        { status: 400 }
      );
    }

    // Verify assignee is a team member of the project
    const project = await Project.findById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isMember = project.teamMembers.some(
      (m: any) => m.toString() === assignedTo
    );
    if (!isMember) {
      return NextResponse.json(
        { error: "Assignee must be a project team member" },
        { status: 400 }
      );
    }

    const task = await Task.create({
      projectId,
      title,
      description,
      assignedTo,
      assignedBy: (session.user as any).id,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      status: "todo",
    });

    const populated = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .populate("projectId", "title")
      .lean();

    await logActivity({
      userId: (session.user as any).id,
      action: "CREATE_TASK",
      details: `Created task "${title}" in project "${project.title}"`,
    });

    return NextResponse.json({ task: populated }, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}