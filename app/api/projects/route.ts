import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Project from "@/models/Project";
import { logActivity } from "@/lib/logActivity";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const role = (session.user as any).role;
    const userId = (session.user as any).id;

    let projects;
    if (role === "ceo" || role === "manager") {
      projects = await Project.find({})
        .populate("createdBy", "name email")
        .populate("teamMembers", "name email role")
        .sort({ createdAt: -1 })
        .lean();
    } else {
      // Employee: only assigned projects
      projects = await Project.find({ teamMembers: userId })
        .populate("createdBy", "name email")
        .populate("teamMembers", "name email role")
        .sort({ createdAt: -1 })
        .lean();
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
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
    const { title, description, teamMembers, startDate, endDate } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required" },
        { status: 400 }
      );
    }

    const project = await Project.create({
      title,
      description,
      createdBy: (session.user as any).id,
      teamMembers: teamMembers || [],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    const populated = await Project.findById(project._id)
      .populate("createdBy", "name email")
      .populate("teamMembers", "name email role")
      .lean();

    await logActivity({
      userId: (session.user as any).id,
      action: "CREATE_PROJECT",
      details: `Created project "${title}"`,
    });

    return NextResponse.json({ project: populated }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}