import mongoose, { Types } from "mongoose";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";

function toObjectId(id: any): Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

export interface InvoiceListFilter {
  companyId: string | Types.ObjectId;
  clientId?: string | Types.ObjectId | null;
  projectId?: string | Types.ObjectId | null;
  invoiceId?: string | Types.ObjectId | null;
  /** Filter by the derived display status (paid, overdue, ...). */
  status?: string | null;
}

/**
 * Shared aggregation pipeline that enriches invoices with:
 *  - the derived display status (paid / partially_paid / overdue / sent / ...)
 *  - the outstanding amount
 *  - the client name (clientId becomes { _id, clientName })
 *  - the payment ledger from the standalone Payment collection, normalized to
 *    the `{ amount, date, method, note, transactionId }` shape the UI expects.
 *
 * All figures come from the aggregation framework — no JS-side math.
 */
export function invoiceListPipeline(filter: InvoiceListFilter): any[] {
  const match: Record<string, any> = { companyId: toObjectId(filter.companyId) };
  if (filter.invoiceId) match._id = toObjectId(filter.invoiceId);
  if (filter.clientId) match.clientId = toObjectId(filter.clientId);
  if (filter.projectId) match.projectId = toObjectId(filter.projectId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const stages: any[] = [
    { $match: match },
    {
      $addFields: {
        _todayStart: todayStart,
        _total: {
          $add: [{ $ifNull: ["$amount", 0] }, { $ifNull: ["$tax", 0] }],
        },
      },
    },
    {
      $addFields: {
        _effectiveStatus: {
          $cond: [
            { $eq: ["$status", "cancelled"] },
            "cancelled",
            {
              $cond: [
                { $eq: ["$status", "draft"] },
                "draft",
                {
                  $let: {
                    vars: { paid: { $ifNull: ["$paidAmount", 0] } },
                    in: {
                      $cond: [
                        {
                          $and: [
                            { $gte: ["$$paid", "$_total"] },
                            { $gt: ["$_total", 0] },
                          ],
                        },
                        "paid",
                        {
                          $cond: [
                            {
                              $and: [
                                { $ifNull: ["$dueDate", null] },
                                { $lt: ["$dueDate", "$_todayStart"] },
                              ],
                            },
                            "overdue",
                            {
                              $cond: [
                                { $gt: ["$$paid", 0] },
                                "partially_paid",
                                "sent",
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  ];

  // Optional filter on the derived status (must run while _effectiveStatus exists).
  if (filter.status) {
    stages.push({ $match: { _effectiveStatus: filter.status } });
  }

  stages.push(
    {
      $lookup: {
        from: "payments",
        localField: "_id",
        foreignField: "invoiceId",
        as: "payments",
      },
    },
    {
      $addFields: {
        payments: {
          $map: {
            input: "$payments",
            as: "p",
            in: {
              _id: "$$p._id",
              amount: "$$p.amount",
              date: "$$p.paymentDate",
              method: "$$p.paymentMethod",
              note: { $ifNull: ["$$p.note", ""] },
              transactionId: { $ifNull: ["$$p.transactionId", ""] },
              recordedBy: "$$p.recordedBy",
            },
          },
        },
      },
    },
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
        status: "$_effectiveStatus",
        outstanding: {
          $max: [
            0,
            { $subtract: ["$_total", { $ifNull: ["$paidAmount", 0] }] },
          ],
        },
        clientId: { _id: "$_client._id", clientName: "$_client.clientName" },
        _todayStart: "$$REMOVE",
        _total: "$$REMOVE",
        _effectiveStatus: "$$REMOVE",
        _client: "$$REMOVE",
      },
    }
  );

  return stages;
}

/** Recompute an invoice's paidAmount from its Payment ledger (aggregation). */
export async function recomputePaidAmount(
  invoiceId: Types.ObjectId | string,
  companyId: Types.ObjectId | string
): Promise<number> {
  const objectId =
    typeof invoiceId === "string"
      ? new mongoose.Types.ObjectId(invoiceId)
      : invoiceId;

  const invoice = await Invoice.findOne({
    _id: objectId,
    companyId: new mongoose.Types.ObjectId(companyId.toString()),
  });
  if (!invoice) return 0;

  const [agg] = await Payment.aggregate([
    {
      $match: {
        invoiceId: objectId,
        companyId: new mongoose.Types.ObjectId(companyId.toString()),
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const total = (invoice.amount || 0) + (invoice.tax || 0);
  const paid = Math.min(total, agg?.total || 0);
  invoice.paidAmount = paid;
  await invoice.save();
  return paid;
}
