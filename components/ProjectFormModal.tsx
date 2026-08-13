"use client";

import { useState } from "react";

export interface ProjectRecord {
  _id: string;
  projectName: string;
  projectCode?: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  budget?: number;
  estimatedHours?: number;
  actualHours?: number;
  startDate?: string;
  endDate?: string;
  clientId?:
    | { _id: string; clientName: string }
    | string
    | null;
  projectManagerId?:
    | { _id: string; fullName: string; name: string; email: string }
    | string
    | null;
  teamMemberIds: Array<{
    _id: string;
    fullName: string;
    name: string;
    email: string;
    role?: string;
  }>;
  createdAt?: string;
}

export interface UserOption {
  _id: string;
  fullName: string;
  name: string;
  email: string;
  role?: string;
}

export interface ClientOption {
  _id: string;
  clientName: string;
}

interface ProjectFormModalProps {
  open: boolean;
  project: ProjectRecord | null;
  clients: ClientOption[];
  users: UserOption[];
  onClose: () => void;
  onSaved: () => void;
}

interface ProjectForm {
  projectName: string;
  projectCode: string;
  description: string;
  status: string;
  priority: string;
  clientId: string;
  projectManagerId: string;
  teamMemberIds: string[];
  budget: string;
  estimatedHours: string;
  startDate: string;
  endDate: string;
}

const emptyForm: ProjectForm = {
  projectName: "",
  projectCode: "",
  description: "",
  status: "active",
  priority: "medium",
  clientId: "",
  projectManagerId: "",
  teamMemberIds: [],
  budget: "",
  estimatedHours: "",
  startDate: "",
  endDate: "",
};

function toForm(project: ProjectRecord | null): ProjectForm {
  if (!project) return emptyForm;
  const client = project.clientId;
  const pm = project.projectManagerId;
  return {
    projectName: project.projectName || "",
    projectCode: project.projectCode || "",
    description: project.description || "",
    status: project.status || "active",
    priority: project.priority || "medium",
    clientId: typeof client === "string" ? client : client?._id || "",
    projectManagerId:
      typeof pm === "string" ? pm : pm?._id || "",
    teamMemberIds: project.teamMemberIds.map((m) => m._id),
    budget:
      project.budget !== undefined && project.budget !== null
        ? String(project.budget)
        : "",
    estimatedHours:
      project.estimatedHours !== undefined && project.estimatedHours !== null
        ? String(project.estimatedHours)
        : "",
    startDate: project.startDate
      ? project.startDate.slice(0, 10)
      : "",
    endDate: project.endDate ? project.endDate.slice(0, 10) : "",
  };
}

export default function ProjectFormModal({
  open,
  project,
  clients,
  users,
  onClose,
  onSaved,
}: ProjectFormModalProps) {
  const [form, setForm] = useState<ProjectForm>(() => toForm(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const set = (field: keyof ProjectForm, value: string | string[]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleMember = (id: string) => {
    setForm((f) => ({
      ...f,
      teamMemberIds: f.teamMemberIds.includes(id)
        ? f.teamMemberIds.filter((x) => x !== id)
        : [...f.teamMemberIds, id],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      projectName: form.projectName,
      projectCode: form.projectCode || undefined,
      description: form.description,
      status: form.status,
      priority: form.priority,
      clientId: form.clientId || undefined,
      projectManagerId: form.projectManagerId || undefined,
      teamMemberIds: form.teamMemberIds,
      budget: form.budget === "" ? undefined : Number(form.budget),
      estimatedHours:
        form.estimatedHours === "" ? undefined : Number(form.estimatedHours),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    };

    try {
      const res = project
        ? await fetch(`/api/projects/${project._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save project");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h2>{project ? "Edit Project" : "New Project"}</h2>
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
          <Field label="Project Name" required>
            <input
              type="text"
              value={form.projectName}
              onChange={(e) => set("projectName", e.target.value)}
              placeholder="e.g. Website Redesign"
              className={inputCls}
            />
          </Field>
          <Field label="Project Code">
            <input
              type="text"
              value={form.projectCode}
              onChange={(e) => set("projectCode", e.target.value)}
              placeholder="e.g. WR-2026-001"
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" required>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What is this project about?"
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="on-hold">On Hold</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              className={inputCls}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Client">
            <select
              value={form.clientId}
              onChange={(e) => set("clientId", e.target.value)}
              className={inputCls}
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.clientName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project Manager">
            <select
              value={form.projectManagerId}
              onChange={(e) => set("projectManagerId", e.target.value)}
              className={inputCls}
            >
              <option value="">No project manager</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName || u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Budget">
            <input
              type="number"
              min={0}
              value={form.budget}
              onChange={(e) => set("budget", e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>
          <Field label="Estimated Hours">
            <input
              type="number"
              min={0}
              value={form.estimatedHours}
              onChange={(e) => set("estimatedHours", e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>
          <Field label="Start Date">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="End Date">
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Team Members">
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2">
                {users.length === 0 && (
                  <p className="px-2 py-1 text-sm text-zinc-400">
                    No users available
                  </p>
                )}
                {users.map((u) => (
                  <label
                    key={u._id}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.teamMemberIds.includes(u._id)}
                      onChange={() => toggleMember(u._id)}
                      className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {u.fullName || u.name}
                      {u.role ? (
                        <span className="text-zinc-400"> ({u.role})</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
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
            {saving ? "Saving..." : project ? "Save Changes" : "Create Project"}
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
