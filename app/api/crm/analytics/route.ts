import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Lead, { OPEN_STAGES, LEAD_STAGES } from "@/models/Lead";
import Opportunity from "@/models/Opportunity";
import User from "@/models/User";
import { requireAuth, handleApiError } from "@/lib/guards";

/**
 * Pipeline analytics: funnel, win/loss rates, value, source and owner
 * breakdowns, average time-to-close, and a monthly won-value trend. All
 * computed live from MongoDB via aggregations.
 */
export async function GET() {
  try {
    const { companyId } = await requireAuth("crm.read");
    await dbConnect();

    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Funnel: count + estimated value per stage.
    const funnelRaw = await Lead.aggregate([
      { $match: { companyId: companyObjectId, deletedAt: null } },
      {
        $group: {
          _id: "$stage",
          count: { $sum: 1 },
          value: { $sum: { $ifNull: ["$estimatedValue", 0] } },
        },
      },
    ]);
    const funnelMap = new Map(funnelRaw.map((f) => [f._id, f]));
    const funnel = LEAD_STAGES.map((stage) => ({
      stage,
      count: funnelMap.get(stage)?.count || 0,
      value: funnelMap.get(stage)?.value || 0,
    }));

    const open = funnel.filter((f) =>
      (OPEN_STAGES as readonly string[]).includes(f.stage)
    );
    const openCount = open.reduce((s, f) => s + f.count, 0);
    const openValue = open.reduce((s, f) => s + f.value, 0);
    const won = funnelMap.get("won") || { count: 0, value: 0 };
    const lost = funnelMap.get("lost") || { count: 0, value: 0 };
    const totalLeads = funnel.reduce((s, f) => s + f.count, 0);
    const decided = won.count + lost.count;

    // Average days from creation to close for won leads.
    const closeAgg = await Lead.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          deletedAt: null,
          stage: "won",
          closedAt: { $ne: null },
          createdAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          avgDays: { $avg: { $divide: [{ $subtract: ["$closedAt", "$createdAt"] }, DAY_MS] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Conversion by source.
    const sourceAgg = await Lead.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          deletedAt: null,
          source: { $ne: "" },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$source", "unknown"] },
          count: { $sum: 1 },
          wonCount: {
            $sum: { $cond: [{ $eq: ["$stage", "won"] }, 1, 0] },
          },
          wonValue: {
            $sum: {
              $cond: [
                { $eq: ["$stage", "won"] },
                { $ifNull: ["$estimatedValue", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { count: -1 } },
    ]);
    const bySource = sourceAgg.map((s) => ({
      source: s._id,
      count: s.count,
      wonCount: s.wonCount,
      wonValue: s.wonValue,
    }));

    // Pipeline value by owner.
    const ownerAgg = await Lead.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          deletedAt: null,
          ownerId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$ownerId",
          count: { $sum: 1 },
          openValue: {
            $sum: {
              $cond: [
                { $in: ["$stage", OPEN_STAGES] },
                { $ifNull: ["$estimatedValue", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { openValue: -1 } },
    ]);
    const ownerIds = ownerAgg.map((o) => o._id).filter(Boolean);
    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds }, companyId })
          .select("fullName name email")
          .lean()
      : [];
    const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));
    const byOwner = ownerAgg.map((o) => ({
      ownerId: o._id,
      owner: ownerMap.get(o._id.toString()) || null,
      count: o.count,
      openValue: o.openValue,
    }));

    // Proposal tracking across opportunities.
    const proposalAgg = await Opportunity.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          deletedAt: null,
          "proposal.status": { $ne: null },
        },
      },
      { $group: { _id: "$proposal.status", count: { $sum: 1 } } },
    ]);
    const proposalMap = new Map(proposalAgg.map((p) => [p._id, p.count]));
    const proposals = {
      sent: proposalMap.get("sent") || 0,
      accepted: proposalMap.get("accepted") || 0,
      rejected: proposalMap.get("rejected") || 0,
      draft: proposalMap.get("draft") || 0,
      total: proposalAgg.reduce((s, p) => s + p.count, 0),
    };

    // Monthly won-value trend (last 6 months).
    const trendRaw = await Lead.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          deletedAt: null,
          stage: "won",
          closedAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$closedAt" },
          },
          count: { $sum: 1 },
          value: { $sum: { $ifNull: ["$estimatedValue", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const wonTrend = trendRaw.map((t) => ({
      month: t._id,
      count: t.count,
      value: t.value,
    }));

    return NextResponse.json({
      funnel,
      totals: {
        totalLeads,
        totalValue: funnel.reduce((s, f) => s + f.value, 0),
        openCount,
        openValue,
        wonCount: won.count,
        wonValue: won.value,
        lostCount: lost.count,
        lostValue: lost.value,
        winRate: decided > 0 ? Math.round((won.count / decided) * 1000) / 10 : 0,
        conversionRate:
          totalLeads > 0 ? Math.round((won.count / totalLeads) * 1000) / 10 : 0,
        avgDaysToClose: closeAgg[0]?.avgDays ?? null,
        closedCount: closeAgg[0]?.count ?? 0,
      },
      bySource,
      byOwner,
      proposals,
      wonTrend,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
