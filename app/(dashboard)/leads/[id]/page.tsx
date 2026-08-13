"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, redirect } from "next/navigation";
import Link from "next/link";
import LeadFormModal, {
  LeadRecord,
  UserOption,
  LEAD_STAGES_UI,
  STAGE_LABELS,
} from "@/components/LeadFormModal";
import OpportunityFormModal, {
  OpportunityRecord,
} from "@/components/OpportunityFormModal";
import FollowUpFormModal, {
  FollowUpRecord,
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_STATUS_LABELS,
} from "@/components/FollowUpFormModal";

const CRM_ROLES = ["ceo", "hr", "project_manager", "team_lead", "accounts"];

const STAGE_BADGE: Record<string, string> = {
  lead: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  qualified: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  proposal: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  negotiation: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  won: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  lost: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function LeadProfilePage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [opportunity, setOpportunity] = useState<OpportunityRecord | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [editModal, setEditModal] = useState(false);
  const [convertModal, setConvertModal] = useState(false);
  const [followUpModal, setFollowUpModal] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role && !CRM_ROLES.includes(role))
      redirect("/");
  }, [authStatus, role]);

  const fetchLead = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/leads/${id}`);
      if (!res.ok) throw new Error("Failed to fetch lead");
      const data = await res.json();
      setLead(data.lead);
      setFollowUps(data.followUps || []);
      setOpportunity(data.opportunity || null);
    } catch (err) {
      console.error("Error fetching lead:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?status=active&pageSize=200");
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  }, []);

  useEffect(() => {
    if (id && role && CRM_ROLES.includes(role)) {
      fetchLead();
      fetchUsers();
    }
  }, [id, role, fetchLead, fetchUsers]);

  const handleStageMove = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActionError("");
    try {
      const res = await fetch(`/api/leads/${id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: e.target.value }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to move lead");
        return;
      }
      await fetchLead();
    } catch (err) {
      console.error("Error moving lead:", err);
      setActionError("Something went wrong");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this lead? Its audit trail is kept.")) return;
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to delete lead");
        return;
      }
      router.push("/crm");
    } catch (err) {
      console.error("Error deleting lead:", err);
      setActionError("Something went wrong");
    }
  };

  if (authStatus === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <p className="text-zinc-500 dark:text-zinc-400">Lead not found</p>
        <Link href="/crm" className="text-sm text-indigo-600 dark:text-indigo-400">
          ← Back to pipeline
        </Link>
      </div>
    );
  }

  const canManage = role === "ceo" || role === "project_manager";
  const owner = lead.ownerId as UserOption | undefined;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link href="/crm" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
          ← Pipeline
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xl font-bold">
            {lead.companyName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {lead.companyName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STAGE_BADGE[lead.stage] || STAGE_BADGE.lead}`}>
                {STAGE_LABELS[lead.stage] || lead.stage}
              </span>
              {lead.convertedAt && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                  Converted to opportunity
                </span>
              )}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={lead.stage}
              onChange={handleStageMove}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {LEAD_STAGES_UI.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
            <button
              onClick={() => setEditModal(true)}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Edit
            </button>
            {!opportunity && !lead.convertedAt && (
              <button
                onClick={() => setConvertModal(true)}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
              >
                Convert to Opportunity
              </button>
            )}
            <button
              onClick={handleDelete}
              className="rounded-lg border border-red-200 dark:border-red-900 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Opportunity card */}
          {opportunity ? (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Opportunity
                </h2>
                <Link
                  href={`/opportunities/${opportunity._id}`}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View timeline →
                </Link>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {opportunity.opportunityName}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Stage: {STAGE_LABELS[opportunity.stage] || opportunity.stage}
                    {opportunity.proposal?.status
                      ? ` · Proposal: ${
                          (opportunity.proposal.status[0] || "").toUpperCase() +
                          opportunity.proposal.status.slice(1)
                        }`
                      : ""}
                  </p>
                </div>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {opportunity.value !== undefined && opportunity.value !== null
                    ? fmt(opportunity.value)
                    : "—"}
                </span>
              </div>
            </div>
          ) : lead.convertedAt ? (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                This lead was converted but the opportunity was deleted.
              </p>
            </div>
          ) : null}

          {/* Notes */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
              Notes
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
              {lead.notes || "No notes yet."}
            </p>
          </div>

          {/* Follow-ups */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Follow-ups
              </h2>
              {canManage && (
                <button
                  onClick={() => setFollowUpModal(true)}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Schedule
                </button>
              )}
            </div>
            {followUps.length === 0 ? (
              <p className="text-sm text-zinc-400">No follow-ups scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {followUps.map((f) => (
                  <li
                    key={f._id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {f.title}
                      </p>
                      <span className="text-xs text-zinc-400">
                        {new Date(f.dueAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {FOLLOWUP_TYPE_LABELS[f.type] || f.type}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          f.status === "completed"
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                            : new Date(f.dueAt) < new Date() && f.status === "pending"
                            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {new Date(f.dueAt) < new Date() && f.status === "pending"
                          ? "Overdue"
                          : FOLLOWUP_STATUS_LABELS[f.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column: details */}
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Lead Details
            </h2>
            <dl className="space-y-3 text-sm">
              <DetailRow label="Contact" value={lead.contactName || "—"} />
              <DetailRow
                label="Email"
                value={lead.email ? (
                  <a href={`mailto:${lead.email}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    {lead.email}
                  </a>
                ) : "—"}
              />
              <DetailRow label="Phone" value={lead.phone || "—"} />
              <DetailRow label="Source" value={lead.source || "—"} />
              <DetailRow
                label="Estimated Value"
                value={
                  lead.estimatedValue !== undefined && lead.estimatedValue !== null
                    ? fmt(lead.estimatedValue)
                    : "—"
                }
              />
              <DetailRow
                label="Owner"
                value={
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                      {(owner?.fullName || owner?.name || "U").charAt(0).toUpperCase()}
                    </span>
                    {owner ? owner.fullName || owner.name : "Unassigned"}
                  </span>
                }
              />
              <DetailRow
                label="Created"
                value={new Date(lead.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              />
              <DetailRow
                label="Stage Changed"
                value={new Date(lead.stageChangedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              />
              {lead.closedAt && (
                <DetailRow
                  label="Closed"
                  value={new Date(lead.closedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                />
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Modals */}
      <LeadFormModal
        open={editModal}
        lead={lead}
        users={users}
        onClose={() => setEditModal(false)}
        onSaved={fetchLead}
      />

      <OpportunityFormModal
        open={convertModal}
        opportunity={null}
        users={users}
        leadId={id}
        leadName={lead.companyName}
        onClose={() => setConvertModal(false)}
        onSaved={(oppId) => {
          fetchLead();
          if (oppId) router.push(`/opportunities/${oppId}`);
        }}
      />

      <FollowUpFormModal
        open={followUpModal}
        followUp={null}
        users={users}
        leadId={id}
        leadLabel={lead.companyName}
        onClose={() => setFollowUpModal(false)}
        onSaved={fetchLead}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-zinc-500 dark:text-zinc-400 shrink-0">{label}</dt>
      <dd className="text-right text-zinc-900 dark:text-zinc-100 min-w-0 wrap-break-word">
        {value}
      </dd>
    </div>
  );
}
