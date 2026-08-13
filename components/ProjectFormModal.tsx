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
      <div className="modal-box project-modal-box">
        <div className="modal-header">
          <div className="project-modal-header-text">
            <h2>{project ? "Edit Project" : "New Project"}</h2>
            <p>
              {project
                ? "Update project details, team, and timeline"
                : "Add a new project to your portfolio"}
            </p>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="project-form-error">{error}</div>}

          <div className="project-form-grid">
            <Field label="Project Name" required>
              <input
                type="text"
                value={form.projectName}
                onChange={(e) => set("projectName", e.target.value)}
                placeholder="e.g. Website Redesign"
                className="input"
              />
            </Field>
            <Field label="Project Code">
              <input
                type="text"
                value={form.projectCode}
                onChange={(e) => set("projectCode", e.target.value)}
                placeholder="e.g. WR-2026-001"
                className="input"
              />
            </Field>

            <div className="project-form-full">
              <Field label="Description" required>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What is this project about?"
                  rows={3}
                  className="input"
                  style={{ resize: "vertical", minHeight: 84 }}
                />
              </Field>
            </div>

            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="input"
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
                className="input"
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
                className="input"
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
                className="input"
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
                className="input"
              />
            </Field>
            <Field label="Estimated Hours">
              <input
                type="number"
                min={0}
                value={form.estimatedHours}
                onChange={(e) => set("estimatedHours", e.target.value)}
                placeholder="0"
                className="input"
              />
            </Field>
            <Field label="Start Date">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="End Date">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className="input"
              />
            </Field>

            <div className="project-form-full">
              <Field label="Team Members">
                <div className="project-team-picker">
                  {users.length === 0 ? (
                    <p className="project-team-empty">No users available</p>
                  ) : (
                    users.map((u) => (
                      <label key={u._id} className="project-team-option">
                        <input
                          type="checkbox"
                          checked={form.teamMemberIds.includes(u._id)}
                          onChange={() => toggleMember(u._id)}
                        />
                        <span>
                          {u.fullName || u.name}
                          {u.role ? <span className="role"> ({u.role})</span> : null}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? "Saving..." : project ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
      <label className="project-form-label">
        {label}
        {required && <span className="project-form-required"> *</span>}
      </label>
      {children}
    </div>
  );
}
