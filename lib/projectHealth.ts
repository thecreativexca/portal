/**
 * Shared project-health and utilization helpers.
 *
 * All values are derived from real, stored project data (progress, dates,
 * milestones, estimated/actual hours) — never hardcoded. The portfolio list,
 * the detail page, and the summary tiles all call these so the numbers stay
 * consistent.
 */

export type ProjectHealth = "on-track" | "at-risk" | "delayed" | "completed";

export interface MilestoneSummary {
  total: number;
  completed: number;
  overdue: number;
}

export interface ProjectHealthInput {
  status?: string;
  progress?: number;
  endDate?: Date | string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  milestoneSummary?: MilestoneSummary | null;
}

/** Whole days from today until the given date (negative when in the past). */
export function daysUntilEnd(endDate?: Date | string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Health classification:
 *  - completed  when the project status is completed
 *  - delayed    when it has an overdue milestone or the end date has passed
 *  - at-risk    when it ends within a week unfinished, or actual hours already
 *               exceed the estimate
 *  - on-track   otherwise
 */
export function computeProjectHealth(p: ProjectHealthInput): ProjectHealth {
  if (p.status === "completed") return "completed";

  const due = daysUntilEnd(p.endDate);
  const ms = p.milestoneSummary || { total: 0, completed: 0, overdue: 0 };

  if (ms.overdue > 0 || (due !== null && due < 0)) return "delayed";

  const dueSoon =
    due !== null &&
    due >= 0 &&
    due <= 7 &&
    (p.progress ?? 0) < 100;
  const hoursOver =
    !!p.estimatedHours &&
    !!p.actualHours &&
    p.actualHours > p.estimatedHours;
  if (dueSoon || hoursOver) return "at-risk";

  return "on-track";
}

/** Actual hours as a percentage of the estimate (null when no estimate). */
export function hoursUtilization(
  estimatedHours?: number | null,
  actualHours?: number | null
): number | null {
  if (!estimatedHours || estimatedHours <= 0) return null;
  return ((actualHours || 0) / estimatedHours) * 100;
}

/** Estimated budget consumed so far, derived from real progress. */
export function budgetConsumed(
  budget?: number | null,
  progress?: number
): number {
  if (!budget) return 0;
  const pct = Math.max(0, Math.min(100, progress || 0));
  return Math.round((budget * pct) / 100);
}
