import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import Expense from "@/models/Expense";
import Payroll from "@/models/Payroll";
import { requireAuth, handleApiError } from "@/lib/guards";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const { companyId } = await requireAuth("finance.read");
    await dbConnect();

    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const [invoiceTotals, paymentTotals, expenseTotals, payrollTotals, alerts] =
      await Promise.all([
        // Invoiced vs collected vs outstanding (excludes cancelled).
        Invoice.aggregate([
          {
            $match: {
              companyId: companyObjectId,
              status: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: null,
              totalInvoiced: {
                $sum: {
                  $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }],
                },
              },
              totalCollected: { $sum: { $ifNull: ["$paidAmount", 0] } },
            },
          },
        ]),
        // Cash actually received, this month + all-time.
        Payment.aggregate([
          { $match: { companyId: companyObjectId } },
          {
            $group: {
              _id: null,
              allTime: { $sum: "$amount" },
              thisMonth: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$paymentDate", currentMonthStart] },
                        { $lte: ["$paymentDate", currentMonthEnd] },
                      ],
                    },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        // Expense totals: all-time + this month.
        Expense.aggregate([
          { $match: { companyId: companyObjectId } },
          {
            $group: {
              _id: null,
              allTime: { $sum: "$amount" },
              thisMonth: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$date", currentMonthStart] },
                        { $lte: ["$date", currentMonthEnd] },
                      ],
                    },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        // Payroll: pending cash-out + this month's cost.
        Payroll.aggregate([
          {
            $match: {
              companyId: companyObjectId,
              paymentStatus: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: null,
              pending: {
                $sum: {
                  $cond: [
                    { $eq: ["$paymentStatus", "pending"] },
                    "$netSalary",
                    0,
                  ],
                },
              },
              thisMonth: {
                $sum: {
                  $cond: [
                    { $eq: ["$month", monthKey(now)] },
                    "$netSalary",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        // Overdue / outstanding alerts.
        Invoice.aggregate([
          {
            $match: {
              companyId: companyObjectId,
              status: { $ne: "cancelled" },
            },
          },
          {
            $addFields: {
              _total: {
                $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }],
              },
              _today: todayStart,
            },
          },
          {
            $addFields: {
              outstanding: {
                $max: [
                  0,
                  {
                    $subtract: ["$_total", { $ifNull: ["$paidAmount", 0] }],
                  },
                ],
              },
              overdue: {
                $and: [
                  { $ifNull: ["$dueDate", null] },
                  { $lt: ["$dueDate", todayStart] },
                ],
              },
            },
          },
          { $match: { outstanding: { $gt: 0 } } },
          {
            $lookup: {
              from: "clients",
              localField: "clientId",
              foreignField: "_id",
              as: "_client",
            },
          },
          { $unwind: { path: "$_client", preserveNullAndEmptyArrays: true } },
          {
            $addFields: {
              clientName: { $ifNull: ["$_client.clientName", "Unknown"] },
              daysOverdue: {
                $cond: [
                  { $eq: ["$overdue", true] },
                  {
                    $floor: {
                      $divide: [
                        { $subtract: [todayStart, "$dueDate"] },
                        86400000,
                      ],
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              invoiceNumber: 1,
              amount: 1,
              tax: 1,
              paidAmount: 1,
              outstanding: 1,
              dueDate: 1,
              overdue: 1,
              daysOverdue: 1,
              clientName: 1,
            },
          },
          { $sort: { overdue: -1, dueDate: 1 } },
          { $limit: 8 },
        ]),
      ]);

    const inv = invoiceTotals[0] || { totalInvoiced: 0, totalCollected: 0 };
    const totalInvoiced = inv.totalInvoiced || 0;
    const totalCollected = inv.totalCollected || 0;
    const payment = paymentTotals[0] || { allTime: 0, thisMonth: 0 };
    const expense = expenseTotals[0] || { allTime: 0, thisMonth: 0 };
    const payroll = payrollTotals[0] || { pending: 0, thisMonth: 0 };

    // Overdue figure from the alert set (invoices with outstanding & past due).
    const overdueAmount = alerts.reduce(
      (sum, a: any) => sum + (a.overdue ? a.outstanding : 0),
      0
    );

    return NextResponse.json({
      kpis: {
        totalInvoiced,
        totalCollected,
        outstanding: Math.max(0, totalInvoiced - totalCollected),
        overdueAmount,
        cashThisMonth: payment.thisMonth || 0,
        totalCashReceived: payment.allTime || 0,
        expensesThisMonth: expense.thisMonth || 0,
        totalExpenses: expense.allTime || 0,
        payrollPending: payroll.pending || 0,
        payrollThisMonth: payroll.thisMonth || 0,
      },
      outstandingInvoices: alerts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
