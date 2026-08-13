"use client";

import { useState } from "react";
import { LEAD_STAGES_UI, STAGE_LABELS, UserOption } from "./LeadFormModal";

export interface OpportunityRecord {
  _id: string;
  leadId?: { _id: string; companyName: string; contactName?: string; email?: string; stage?: string } | string | null;
  opportunityName: string;
  value?: number;
  expectedCloseDate?: string;
  probability?: number;
  stage: string;
  proposal?: {
    sentAt?: string;
    dueAt?: string;
    status?: string;
  };
  timeline: TimelineEvent[];
  ownerId?: UserOption | string | null;
  notes?: string;
  createdAt: string;
  closedAt?: string | null;
}

export interface TimelineEvent {
  _id?: string;
  type: string;
  title: string;
  description?: string;
  userId?: string | { _id: string; fullName: string; name: string };
  at: string;
}

export const PROPOSAL_STATUS_LABELS_UI: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

const PROPOSAL_STATUSES_UI = ["draft", "sent", "accepted", "rejected"];

interface OpportunityFormModalProps {
  open: boolean;
  opportunity: OpportunityRecord | null;
  users: UserOption[];
  /** Preset lead to attach when converting a lead. */
  leadId?: string;
  leadName?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}

interface OpportunityForm {
  opportunityName: string;
  value: string;
  expectedCloseDate: string;
  probability: string;
  stage: string;
  proposalStatus: string;
  proposalDueAt: string;
  ownerId: string;
  notes: string;
}

const emptyForm: OpportunityForm = {
  opportunityName: "",
  value: "",
  expectedCloseDate: "",
  probability: "",
  stage: "qualified",
  proposalStatus: "draft",
  proposalDueAt: "",
  ownerId: "",
  notes: "",
};

function toForm(
  opportunity: OpportunityRecord | null,
  leadName?: string
): OpportunityForm {
  if (!opportunity) {
    return { ...emptyForm, opportunityName: leadName || "" };
  }
  const owner = opportunity.ownerId;
  return {
    opportunityName: opportunity.opportunityName || "",
    value:
      opportunity.value !== undefined && opportunity.value !== null
        ? String(opportunity.value)
        : "",
    expectedCloseDate: opportunity.expectedCloseDate
      ? opportunity.expectedCloseDate.slice(0, 10)
      : "",
    probability:
      opportunity.probability !== undefined && opportunity.probability !== null
        ? String(opportunity.probability)
        : "",
    stage: opportunity.stage || "qualified",
    proposalStatus: opportunity.proposal?.status || "draft",
    proposalDueAt: opportunity.proposal?.dueAt
      ? opportunity.proposal.dueAt.slice(0, 10)
      : "",
    ownerId: typeof owner === "string" ? owner : owner?._id || "",
    notes: opportunity.notes || "",
  };
}

export default function OpportunityFormModal({
  open,
  opportunity,
  users,
  leadId,
  leadName,
  onClose,
  onSaved,
}: OpportunityFormModalProps) {
  const [form, setForm] = useState<OpportunityForm>(() =>
    toForm(opportunity, leadName)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const set = (field: keyof OpportunityForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      leadId: leadId || undefined,
      opportunityName: form.opportunityName,
      value: form.value === "" ? undefined : Number(form.value),
      expectedCloseDate: form.expectedCloseDate || undefined,
      probability:
        form.probability === "" ? undefined : Number(form.probability),
      stage: form.stage,
      proposal: {
        status: form.proposalStatus,
        dueAt: form.proposalDueAt || undefined,
      },
      ownerId: form.ownerId || undefined,
      notes: form.notes,
    };

    try {
      const res = opportunity
        ? await fetch(`/api/opportunities/${opportunity._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/opportunities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save opportunity");
      }

      const data = await res.json();
      onSaved(data.opportunity?._id || opportunity?._id || "");
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save opportunity"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>{opportunity ? "Edit Opportunity" : "New Opportunity"}</h2>
          <button onClick={onClose} className="icon-btn">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {leadId && !opportunity && (
            <div className="sm:col-span-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
              Converting lead: <span className="font-semibold">{leadName}</span>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Opportunity Name" required>
              <input
                type="text"
                value={form.opportunityName}
                onChange={(e) => set("opportunityName", e.target.value)}
                placeholder="e.g. Acme Corp — ERP Implementation"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Deal Value (₹)">
            <input
              type="number"
              min={0}
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>
          <Field label="Probability (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => set("probability", e.target.value)}
              placeholder="0–100"
              className={inputCls}
            />
          </Field>
          <Field label="Stage">
            <select
              value={form.stage}
              onChange={(e) => set("stage", e.target.value)}
              className={inputCls}
            >
              {LEAD_STAGES_UI.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expected Close Date">
            <input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => set("expectedCloseDate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Proposal Status">
            <select
              value={form.proposalStatus}
              onChange={(e) => set("proposalStatus", e.target.value)}
              className={inputCls}
            >
              {PROPOSAL_STATUSES_UI.map((s) => (
                <option key={s} value={s}>
                  {PROPOSAL_STATUS_LABELS_UI[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Proposal Due Date">
            <input
              type="date"
              value={form.proposalDueAt}
              onChange={(e) => set("proposalDueAt", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Owner">
            <select
              value={form.ownerId}
              onChange={(e) => set("ownerId", e.target.value)}
              className={inputCls}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName || u.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Deal context, blockers, next steps..."
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>
        </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Saving..." : opportunity ? "Save Changes" : "Create Opportunity"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
