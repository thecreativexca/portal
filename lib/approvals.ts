import mongoose from "mongoose";
import dbConnect from "./db";
import Approval, { ApprovalType } from "@/models/Approval";
import User from "@/models/User";
import Role from "@/models/Role";
import { notifyUsers, notifyUser } from "./notify";
import { logActivity } from "./logActivity";

/**
 * Resolve the role keys whose documents grant the "approvals.approve"
 * permission for a company. The CEO role is always treated as an approver.
 */
export async function approverRoleKeys(
  companyId: string
): Promise<string[]> {
  await dbConnect();
  const roles = await Role.find({ companyId }).lean();
  return roles
    .filter((r) => r.key === "ceo" || (r.permissions || []).includes("approvals.approve"))
    .map((r) => r.key);
}

/** True when the user's role grants approval rights (CEO always does). */
export async function canApprove(user: {
  role: string;
  companyId: string | mongoose.Types.ObjectId;
}): Promise<boolean> {
  if (user.role === "ceo") return true;
  const keys = await approverRoleKeys(user.companyId.toString());
  return keys.includes(user.role);
}

/**
 * Create a new approval request. Returns the created Approval and, separately,
 * the number of approvers that were notified.
 */
export async function createApprovalRequest({
  companyId,
  userId,
  type,
  entityId,
  title,
  description,
  link,
}: {
  companyId: string;
  userId: string;
  type: ApprovalType;
  entityId?: string;
  title: string;
  description?: string;
  link?: string;
}) {
  await dbConnect();

  const approval = await Approval.create({
    companyId,
    type,
    entityId: entityId || undefined,
    title,
    description,
    requestedBy: userId,
    status: "pending",
  });

  await logActivity({
    userId,
    companyId,
    action: "CREATE_APPROVAL",
    details: `Submitted "${title}" for approval`,
  });

  // Notify every active user who can approve this request.
  const keys = await approverRoleKeys(companyId);
  const approvers = await User.find({
    companyId,
    role: { $in: keys as any },
    status: "active",
  })
    .select("_id")
    .lean();

  await notifyUsers(
    approvers.map((a) => ({
      companyId,
      userId: a._id.toString(),
      title: "Approval requested",
      message: `${title} needs your approval`,
      type: "approval",
      link,
    }))
  );

  return { approval, notifierCount: approvers.length };
}

/**
 * Decide a pending approval (approve / reject). Updates the record, notifies
 * the requester, and records the decision in the audit trail.
 */
export async function decideApproval({
  approval,
  approverUserId,
  approverName,
  status,
  remarks,
}: {
  approval: any;
  approverUserId: string;
  approverName: string;
  status: "approved" | "rejected";
  remarks?: string;
}) {
  await dbConnect();

  approval.status = status;
  approval.approvedBy = new mongoose.Types.ObjectId(approverUserId);
  approval.remarks = remarks || approval.remarks;
  approval.decidedAt = new Date();
  await approval.save();

  await logActivity({
    userId: approverUserId,
    companyId: approval.companyId.toString(),
    action: status === "approved" ? "APPROVE_APPROVAL" : "REJECT_APPROVAL",
    details: `${status === "approved" ? "Approved" : "Rejected"} "${approval.title}"${remarks ? ` (${remarks})` : ""}`,
  });

  await notifyUser({
    companyId: approval.companyId.toString(),
    userId: approval.requestedBy.toString(),
    title: status === "approved" ? "Request approved" : "Request rejected",
    message: `"${approval.title}" was ${status} by ${approverName}`,
    type: "approval",
    link: "/approvals",
  });

  return approval;
}
