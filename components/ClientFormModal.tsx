"use client";

import { useState } from "react";

export interface ClientRecord {
  _id: string;
  clientName: string;
  legalName?: string;
  industry?: string;
  website?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  accountManagerId?:
    | { _id: string; fullName: string; name: string; email: string }
    | string
    | null;
  contractValue?: number;
  contractStartDate?: string;
  contractEndDate?: string;
  renewalDate?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

export interface UserOption {
  _id: string;
  fullName: string;
  name: string;
  email: string;
}

interface ClientFormModalProps {
  open: boolean;
  client: ClientRecord | null;
  accountManagers: UserOption[];
  onClose: () => void;
  onSaved: () => void;
}

interface ClientForm {
  clientName: string;
  legalName: string;
  industry: string;
  website: string;
  gstNumber: string;
  address: string;
  city: string;
  state: string;
  country: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  accountManagerId: string;
  contractValue: string;
  contractStartDate: string;
  contractEndDate: string;
  renewalDate: string;
  status: string;
  notes: string;
}

const emptyForm: ClientForm = {
  clientName: "",
  legalName: "",
  industry: "",
  website: "",
  gstNumber: "",
  address: "",
  city: "",
  state: "",
  country: "",
  primaryContactName: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  accountManagerId: "",
  contractValue: "",
  contractStartDate: "",
  contractEndDate: "",
  renewalDate: "",
  status: "lead",
  notes: "",
};

function toForm(client: ClientRecord | null): ClientForm {
  if (!client) return emptyForm;
  const am = client.accountManagerId;
  return {
    clientName: client.clientName || "",
    legalName: client.legalName || "",
    industry: client.industry || "",
    website: client.website || "",
    gstNumber: client.gstNumber || "",
    address: client.address || "",
    city: client.city || "",
    state: client.state || "",
    country: client.country || "",
    primaryContactName: client.primaryContactName || "",
    primaryContactEmail: client.primaryContactEmail || "",
    primaryContactPhone: client.primaryContactPhone || "",
    accountManagerId: typeof am === "string" ? am : am?._id || "",
    contractValue:
      client.contractValue !== undefined && client.contractValue !== null
        ? String(client.contractValue)
        : "",
    contractStartDate: client.contractStartDate
      ? client.contractStartDate.slice(0, 10)
      : "",
    contractEndDate: client.contractEndDate
      ? client.contractEndDate.slice(0, 10)
      : "",
    renewalDate: client.renewalDate ? client.renewalDate.slice(0, 10) : "",
    status: client.status || "lead",
    notes: client.notes || "",
  };
}

export default function ClientFormModal({
  open,
  client,
  accountManagers,
  onClose,
  onSaved,
}: ClientFormModalProps) {
  const [form, setForm] = useState<ClientForm>(() => toForm(client));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const set = (field: keyof ClientForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      clientName: form.clientName,
      legalName: form.legalName,
      industry: form.industry,
      website: form.website,
      gstNumber: form.gstNumber,
      address: form.address,
      city: form.city,
      state: form.state,
      country: form.country,
      primaryContactName: form.primaryContactName,
      primaryContactEmail: form.primaryContactEmail,
      primaryContactPhone: form.primaryContactPhone,
      accountManagerId: form.accountManagerId || undefined,
      contractValue:
        form.contractValue === "" ? undefined : Number(form.contractValue),
      contractStartDate: form.contractStartDate || undefined,
      contractEndDate: form.contractEndDate || undefined,
      renewalDate: form.renewalDate || undefined,
      status: form.status,
      notes: form.notes,
    };

    try {
      const res = client
        ? await fetch(`/api/clients/${client._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save client");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save client");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h2>{client ? "Edit Client" : "Add New Client"}</h2>
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
          <Field label="Client Name" required>
            <input
              type="text"
              value={form.clientName}
              onChange={(e) => set("clientName", e.target.value)}
              placeholder="e.g. Acme Corp"
              className={inputCls}
            />
          </Field>
          <Field label="Legal Name">
            <input
              type="text"
              value={form.legalName}
              onChange={(e) => set("legalName", e.target.value)}
              placeholder="Registered legal name"
              className={inputCls}
            />
          </Field>
          <Field label="Industry">
            <input
              type="text"
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
              placeholder="e.g. Technology"
              className={inputCls}
            />
          </Field>
          <Field label="Website">
            <input
              type="text"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </Field>
          <Field label="GST Number">
            <input
              type="text"
              value={form.gstNumber}
              onChange={(e) => set("gstNumber", e.target.value)}
              placeholder="22AAAAA0000A1Z5"
              className={inputCls}
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputCls}
            >
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
            </select>
          </Field>
          <Field label="Account Manager">
            <select
              value={form.accountManagerId}
              onChange={(e) => set("accountManagerId", e.target.value)}
              className={inputCls}
            >
              <option value="">No account manager</option>
              {accountManagers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName || u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contract Value">
            <input
              type="number"
              min={0}
              value={form.contractValue}
              onChange={(e) => set("contractValue", e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>
          <Field label="Contract Start Date">
            <input
              type="date"
              value={form.contractStartDate}
              onChange={(e) => set("contractStartDate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Contract End Date">
            <input
              type="date"
              value={form.contractEndDate}
              onChange={(e) => set("contractEndDate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Renewal Date">
            <input
              type="date"
              value={form.renewalDate}
              onChange={(e) => set("renewalDate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Primary Contact Name">
            <input
              type="text"
              value={form.primaryContactName}
              onChange={(e) => set("primaryContactName", e.target.value)}
              placeholder="Contact person"
              className={inputCls}
            />
          </Field>
          <Field label="Primary Contact Email">
            <input
              type="email"
              value={form.primaryContactEmail}
              onChange={(e) => set("primaryContactEmail", e.target.value)}
              placeholder="contact@client.com"
              className={inputCls}
            />
          </Field>
          <Field label="Primary Contact Phone">
            <input
              type="text"
              value={form.primaryContactPhone}
              onChange={(e) => set("primaryContactPhone", e.target.value)}
              placeholder="+91 98765 43210"
              className={inputCls}
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="City"
              className={inputCls}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="State"
              className={inputCls}
            />
          </Field>
          <Field label="Country">
            <input
              type="text"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              placeholder="Country"
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <input
                type="text"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Street address"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Internal notes about this client"
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>
        </div>
        </div>

        <div className="modal-footer">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Saving..." : client ? "Save Changes" : "Create Client"}
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
