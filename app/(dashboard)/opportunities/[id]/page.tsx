"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, redirect } from "next/navigation";
import Link from "next/link";
import OpportunityFormModal, {
  OpportunityRecord,
  TimelineEvent,
  PROPOSAL_STATUS_LABELS_UI,
} from "@/components/OpportunityFormModal";
import FollowUpFormModal, {
  FollowUpRecord,
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_STATUS_LABELS,
} from "@/components/FollowUpFormModal";
import {
  LEAD_STAGES_UI,
  STAGE_LABELS,
  UserOption,
} from "@/components/LeadFormModal";

const CRM_ROLES = ["ceo", "hr", "project_manager", "team_lead", "accounts"];

const STAGE_BADGE: Record<string, string> = {
  lead: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  qualified: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  proposal: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  negotiation: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  won: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  lost: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

const PROPOSAL_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  sent: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  accepted: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  rejected: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const EVENT_META: Record<string, { icon: React.ReactNode; cls: string }> = {
  created: {
    icon: (<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />),
    cls: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300",
  },
  stage_changed: {
    icon: (<path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />),
    cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300",
  },
  proposal: {
    icon: (<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />),
    cls: "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300",
  },
  note: {
    icon: (<path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />),
    cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
  },
  followup: {
    icon: (<path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />),
    cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300",
  },
  won: {
    icon: (<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />),
    cls: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300",
  },
  lost: {
    icon: (<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />),
    cls: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300",
  },
};

export default function OpportunityPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [opportunity, setOpportunity] = useState<OpportunityRecord | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [editModal, setEditModal] = useState(false);
  const [followUpModal, setFollowUpModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role && !CRM_ROLES.includes(role))
      redirect("/");
  }, [authStatus, role]);

  const fetchOpportunity = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/opportunities/${id}`);
      if (!res.ok) throw new Error("Failed to fetch opportunity");
      const data = await res.json();
      setOpportunity(data.opportunity);
      setFollowUps(data.followUps || []);
    } catch (err) {
      console.error("Error fetching opportunity:", err);
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
      fetchOpportunity();
      fetchUsers();
    }
  }, [id, role, fetchOpportunity, fetchUsers]);

  const patch = async (body: Record<string, unknown>) => {
    setActionError("");
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setActionError(data.error || "Failed to update");
      return false;
    }
    await fetchOpportunity();
    return true;
  };

  const handleStageMove = async (e: React.ChangeEvent<HTMLSelectElement>) =>
    patch({ stage: e.target.value });

  const handleProposalStatus = async (e: React.ChangeEvent<HTMLSelectElement>) =>
    patch({ proposal: { status: e.target.value } });

  const handleAddNote = async () => {
    if (!noteDraft.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/opportunities/${id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", title: noteDraft.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to add note");
        return;
      }
      setNoteDraft("");
      await fetchOpportunity();
    } catch (err) {
      console.error("Error adding note:", err);
      setActionError("Something went wrong");
    } finally {
      setAddingNote(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this opportunity? Its audit trail is kept."))
      return;
    try {
      const res = await fetch(`/api/opportunities/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to delete opportunity");
        return;
      }
      const leadId =
        opportunity?.leadId && typeof opportunity.leadId !== "string"
          ? opportunity.leadId._id
          : null;
      router.push(leadId ? `/leads/${leadId}` : "/crm");
    } catch (err) {
      console.error("Error deleting opportunity:", err);
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

  if (!opportunity) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <p className="text-zinc-500 dark:text-zinc-400">Opportunity not found</p>
        <Link href="/crm" className="text-sm text-indigo-600 dark:text-indigo-400">
          ← Back to pipeline
        </Link>
      </div>
    );
  }

  const canManage = role === "ceo" || role === "project_manager";
  const owner = opportunity.ownerId as UserOption | undefined;
  const lead =
    opportunity.leadId && typeof opportunity.leadId !== "string"
      ? opportunity.leadId
      : null;

  const timeline: TimelineEvent[] = [...(opportunity.timeline || [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={lead ? `/leads/${lead._id}` : "/crm"}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          ← {lead ? `Lead: ${lead.companyName}` : "Pipeline"}
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xl font-bold">
            {opportunity.opportunityName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {opportunity.opportunityName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STAGE_BADGE[opportunity.stage] || STAGE_BADGE.qualified}`}>
                {STAGE_LABELS[opportunity.stage] || opportunity.stage}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                PROPOSAL_BADGE[opportunity.proposal?.status || "draft"]
              }`}>
                Proposal: {PROPOSAL_STATUS_LABELS_UI[opportunity.proposal?.status || "draft"]}
              </span>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={opportunity.stage}
              onChange={handleStageMove}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {LEAD_STAGES_UI.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={opportunity.proposal?.status || "draft"}
              onChange={handleProposalStatus}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Proposal status"
            >
              {Object.entries(PROPOSAL_STATUS_LABELS_UI).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              onClick={() => setEditModal(true)}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Edit
            </button>
            <button
              onClick={() => setFollowUpModal(true)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
            >
              + Follow-up
            </button>
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
        {/* Timeline */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            Opportunity Timeline
          </h2>

          {/* Add note */}
          {canManage && (
            <div className="mb-5 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Log a note or update for this deal..."
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !noteDraft.trim()}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
                >
                  {addingNote ? "Adding..." : "Add note"}
                </button>
              </div>
            </div>
          )}

          {timeline.length === 0 ? (
            <p className="text-sm text-zinc-400">No activity recorded yet.</p>
          ) : (
            <ol className="relative border-l border-zinc-200 dark:border-zinc-800 ml-3 space-y-6">
              {timeline.map((ev, i) => {
                const meta = EVENT_META[ev.type] || EVENT_META.note;
                return (
                  <li key={ev._id || i} className="ml-6">
                    <span
                      className={`absolute -left-3.25 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 ${meta.cls}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        {meta.icon}
                      </svg>
                    </span>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {ev.title}
                    </p>
                    {ev.description && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {ev.description}
                      </p>
                    )}
                    <p className="text-xs text-zinc-400 mt-1">
                      {new Date(ev.at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Deal Details
            </h2>
            <dl className="space-y-3 text-sm">
              <DetailRow
                label="Value"
                value={
                  opportunity.value !== undefined && opportunity.value !== null
                    ? fmt(opportunity.value)
                    : "—"
                }
              />
              <DetailRow
                label="Probability"
                value={`${opportunity.probability ?? 0}%`}
              />
              <DetailRow
                label="Expected Close"
                value={
                  opportunity.expectedCloseDate
                    ? new Date(opportunity.expectedCloseDate).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" }
                      )
                    : "—"
                }
              />
              <DetailRow
                label="Proposal Due"
                value={
                  opportunity.proposal?.dueAt
                    ? new Date(opportunity.proposal.dueAt).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" }
                      )
                    : "—"
                }
              />
              <DetailRow
                label="Owner"
                value={
                  <span className="flex items-center justify-end gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                      {(owner?.fullName || owner?.name || "U").charAt(0).toUpperCase()}
                    </span>
                    {owner ? owner.fullName || owner.name : "Unassigned"}
                  </span>
                }
              />
              <DetailRow
                label="Created"
                value={new Date(opportunity.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              />
            </dl>
          </div>

          {opportunity.notes && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                Notes
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                {opportunity.notes}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
              Follow-ups
            </h2>
            {followUps.length === 0 ? (
              <p className="text-sm text-zinc-400">No follow-ups scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {followUps.map((f) => (
                  <li key={f._id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {f.title}
                    </p>
                    <div className="flex items-center justify-between mt-1">
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
      </div>

      <OpportunityFormModal
        open={editModal}
        opportunity={opportunity}
        users={users}
        onClose={() => setEditModal(false)}
        onSaved={fetchOpportunity}
      />

      <FollowUpFormModal
        open={followUpModal}
        followUp={null}
        users={users}
        opportunityId={id}
        opportunityLabel={opportunity.opportunityName}
        onClose={() => setFollowUpModal(false)}
        onSaved={fetchOpportunity}
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
      <dd className="text-right text-zinc-900 dark:text-zinc-100 min-w-0">
        {value}
      </dd>
    </div>
  );
}
