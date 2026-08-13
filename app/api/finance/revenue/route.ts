import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import { requireAuth, handleApiError } from "@/lib/guards";

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Build the last N calendar months (oldest first) as "YYYY-MM" keys. */
function recentMonths(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKeyOf(d));
  }
  return keys;
}

function rangeFor(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

/**
 * Monthly revenue report. `invoiced` is the value billed in the month (from
 * the invoice issue date, excluding cancelled), `collected` is cash received
 * in the month (from the payment ledger), and `outstanding` is the running
 * balance. All figures come from aggregation pipelines.
 */
export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuth("finance.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const months = Math.min(
      24,
      Math.max(1, Number(searchParams.get("months")) || 6)
    );
    const axis = recentMonths(months);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const [invoicedByMonth, collectedByMonth] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            status: { $ne: "cancelled" },
            issueDate: { $gte: rangeFor(axis[0]).start },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$issueDate" } },
            total: {
              $sum: {
                $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }],
              },
            },
          },
        },
      ]),
      Payment.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            paymentDate: { $gte: rangeFor(axis[0]).start },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$paymentDate" } },
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const invoicedMap = new Map(
      invoicedByMonth.map((r: any) => [r._id, r.total as number])
    );
    const collectedMap = new Map(
      collectedByMonth.map((r: any) => [r._id, r.total as number])
    );

    let running = 0;
    const series = axis.map((month) => {
      const invoiced = invoicedMap.get(month) || 0;
      const collected = collectedMap.get(month) || 0;
      running += invoiced - collected;
      return { month, invoiced, collected, outstanding: running };
    });

    return NextResponse.json({
      series,
      totals: {
        invoiced: series.reduce((s, m) => s + m.invoiced, 0),
        collected: series.reduce((s, m) => s + m.collected, 0),
        outstanding: Math.max(0, running),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
