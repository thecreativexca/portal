import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/models/User";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const role = (session.user as any).role;
    const userId = (session.user as any).id;
    const stats: Record<string, any> = {};

    if (role === "ceo") {
      stats.totalEmployees = await User.countDocuments({});
      stats.pendingLeaves = 0; // Placeholder — will be connected when leave module is built
      stats.activeProjects = 0; // Placeholder
    } else if (role === "manager") {
      stats.activeProjects = 0; // Placeholder
      stats.pendingTasks = 0; // Placeholder
      stats.presentToday = false; // Placeholder
    } else {
      // Employee
      stats.pendingTasks = 0; // Placeholder
      stats.presentToday = false; // Placeholder
      stats.activeProjects = 0; // Placeholder
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}