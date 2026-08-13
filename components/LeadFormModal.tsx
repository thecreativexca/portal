"use client";

import { useState } from "react";

export const LEAD_STAGES_UI = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export interface LeadRecord {
  _id: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  estimatedValue?: number;
  stage: string;
  ownerId?:
    | { _id: string; fullName: string; name: string; email: string }
    | string
    | null;
  notes?: string;
  createdAt: string;
  stageChangedAt: string;
  closedAt?: string | null;
  convertedAt?: string | null;
}

export interface UserOption {
  _id: string;
  fullName: string;
  name: string;
  email: string;
}

interface LeadFormModalProps {
  open: boolean;
  lead: LeadRecord | null;
  users: UserOption[];
  onClose: () => void;
  onSaved: () => void;
}

interface LeadForm {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  source: string;
  estimatedValue: string;
  stage: string;
  ownerId: string;
  notes: string;
}

const emptyForm: LeadForm = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  source: "",
  estimatedValue: "",
  stage: "lead",
  ownerId: "",
  notes: "",
};

const SOURCE_OPTIONS = [
  "Website",
  "Referral",
  "Cold Call",
  "Social Media",
  "Email Campaign",
  "Event",
  "Other",
];

function toForm(lead: LeadRecord | null): LeadForm {
  if (!lead) return emptyForm;
  const owner = lead.ownerId;
  return {
    companyName: lead.companyName || "",
    contactName: lead.contactName || "",
    email: lead.email || "",
    phone: lead.phone || "",
    source: lead.source || "",
    estimatedValue:
      lead.estimatedValue !== undefined && lead.estimatedValue !== null
        ? String(lead.estimatedValue)
        : "",
    stage: lead.stage || "lead",
    ownerId: typeof owner === "string" ? owner : owner?._id || "",
    notes: lead.notes || "",
  };
}

export default function LeadFormModal({
  open,
  lead,
  users,
  onClose,
  onSaved,
}: LeadFormModalProps) {
  const [form, setForm] = useState<LeadForm>(() => toForm(lead));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const set = (field: keyof LeadForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      companyName: form.companyName,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      source: form.source,
      estimatedValue:
        form.estimatedValue === "" ? undefined : Number(form.estimatedValue),
      stage: form.stage,
      ownerId: form.ownerId || undefined,
      notes: form.notes,
    };

    try {
      const res = lead
        ? await fetch(`/api/leads/${lead._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save lead");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>{lead ? "Edit Lead" : "Add New Lead"}</h2>
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
          <Field label="Company Name" required>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="e.g. Acme Corp"
              className={inputCls}
            />
          </Field>
          <Field label="Contact Name">
            <input
              type="text"
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="Decision maker"
              className={inputCls}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contact@company.com"
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              type="text"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+91 98765 43210"
              className={inputCls}
            />
          </Field>
          <Field label="Source">
            <input
              type="text"
              list="lead-sources"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              placeholder="Website, Referral, ..."
              className={inputCls}
            />
            <datalist id="lead-sources">
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Estimated Value (₹)">
            <input
              type="number"
              min={0}
              value={form.estimatedValue}
              onChange={(e) => set("estimatedValue", e.target.value)}
              placeholder="0"
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
                placeholder="Context, next steps, pain points..."
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
            {saving ? "Saving..." : lead ? "Save Changes" : "Create Lead"}
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
