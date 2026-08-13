import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/guards";
import {
  computeUserPerformance,
  computeTeamPerformance,
} from "@/lib/performance";

/** Roles allowed to view team / other-employee performance. */
const PEOPLE_ROLES = ["ceo", "hr", "project_manager"];

/** Parse a "YYYY-MM-DD" string as a LOCAL midnight date. Returns null on bad input. */
function parseLocalDate(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Default range: first of this month through today.
    const now = new Date();
    const from = parseLocalDate(searchParams.get("from")) || new Date(now.getFullYear(), now.getMonth(), 1);
    const to = parseLocalDate(searchParams.get("to")) || new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (to.getTime() < from.getTime()) {
      return NextResponse.json(
        { error: "to date must be on or after from date" },
        { status: 400 }
      );
    }

    const canViewTeam = PEOPLE_ROLES.includes(user.role);

    // Team view — no userId.
    if (!userId) {
      if (!canViewTeam) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const team = await computeTeamPerformance({ companyId, from, to });
      return NextResponse.json(team);
    }

    // Per-user view.
    const isSelf = userId === user._id.toString();
    if (!isSelf && !canViewTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const performance = await computeUserPerformance({ companyId, userId, from, to });
    if (!performance) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ performance });
  } catch (error) {
    return handleApiError(error);
  }
}
