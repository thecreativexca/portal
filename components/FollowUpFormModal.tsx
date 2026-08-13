"use client";

import { useState } from "react";
import { UserOption } from "./LeadFormModal";

export const FOLLOWUP_TYPES_UI = ["call", "email", "meeting", "proposal", "other"];

export const FOLLOWUP_TYPE_LABELS: Record<string, string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  proposal: "Proposal",
  other: "Other",
};

export const FOLLOWUP_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  completed: "Completed",
  missed: "Missed",
};

export interface FollowUpRecord {
  _id: string;
  leadId?:
    | { _id: string; companyName: string; contactName?: string; email?: string }
    | string
    | null;
  opportunityId?:
    | { _id: string; opportunityName: string; stage?: string }
    | string
    | null;
  title: string;
  type: string;
  dueAt: string;
  status: string;
  notes?: string;
  assignedToId?: UserOption | string | null;
  createdAt: string;
  completedAt?: string | null;
}

interface FollowUpFormModalProps {
  open: boolean;
  followUp: FollowUpRecord | null;
  users: UserOption[];
  /** Preset lead to attach. */
  leadId?: string;
  leadLabel?: string;
  /** Preset opportunity to attach. */
  opportunityId?: string;
  opportunityLabel?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FollowUpForm {
  title: string;
  type: string;
  dueAt: string;
  notes: string;
  assignedToId: string;
}

const emptyForm: FollowUpForm = {
  title: "",
  type: "call",
  dueAt: "",
  notes: "",
  assignedToId: "",
};

/** datetime-local value: "2026-08-11T14:30". */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toForm(followUp: FollowUpRecord | null): FollowUpForm {
  if (!followUp) return emptyForm;
  const assignee = followUp.assignedToId;
  return {
    title: followUp.title || "",
    type: followUp.type || "call",
    dueAt: toLocalInput(followUp.dueAt),
    notes: followUp.notes || "",
    assignedToId: typeof assignee === "string" ? assignee : assignee?._id || "",
  };
}

export default function FollowUpFormModal({
  open,
  followUp,
  users,
  leadId,
  leadLabel,
  opportunityId,
  opportunityLabel,
  onClose,
  onSaved,
}: FollowUpFormModalProps) {
  const [form, setForm] = useState<FollowUpForm>(() => toForm(followUp));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const set = (field: keyof FollowUpForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      leadId: leadId || undefined,
      opportunityId: opportunityId || undefined,
      title: form.title,
      type: form.type,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
      notes: form.notes,
      assignedToId: form.assignedToId || undefined,
    };

    try {
      const res = followUp
        ? await fetch(`/api/followups/${followUp._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: form.title,
              type: form.type,
              dueAt: body.dueAt,
              notes: form.notes,
              assignedToId: form.assignedToId || undefined,
            }),
          })
        : await fetch("/api/followups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save follow-up");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save follow-up"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2>{followUp ? "Edit Follow-up" : "Schedule Follow-up"}</h2>
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

          {(leadLabel || opportunityLabel) && (
            <div className="mb-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
              {leadLabel && (
                <p>
                  Lead: <span className="font-semibold">{leadLabel}</span>
                </p>
              )}
              {opportunityLabel && (
                <p>
                  Opportunity:{" "}
                  <span className="font-semibold">{opportunityLabel}</span>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Follow up on pricing proposal"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className={inputCls}
            >
              {FOLLOWUP_TYPES_UI.map((t) => (
                <option key={t} value={t}>
                  {FOLLOWUP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due Date & Time" required>
            <input
              type="datetime-local"
              value={form.dueAt}
              onChange={(e) => set("dueAt", e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Assignee">
              <select
                value={form.assignedToId}
                onChange={(e) => set("assignedToId", e.target.value)}
                className={inputCls}
              >
                <option value="">Me (default)</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName || u.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="What to cover on this call / email..."
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
            {saving
              ? "Saving..."
              : followUp
              ? "Save Changes"
              : "Schedule Reminder"}
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
