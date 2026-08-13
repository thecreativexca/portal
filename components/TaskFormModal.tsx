"use client";

import { useEffect, useState } from "react";
import {
  TaskRecord,
  TASK_STATUSES,
  TASK_PRIORITIES,
  STATUS_META,
  inputCls,
} from "@/lib/taskTypes";

interface ProjectOption {
  _id: string;
  projectName: string;
  status?: string;
  teamMemberIds: Array<{ _id: string; fullName: string; name: string; email: string; role?: string }>;
}

interface TaskFormModalProps {
  open: boolean;
  task: TaskRecord | null;
  defaultProjectId?: string;
  onClose: () => void;
  onSaved: (task: TaskRecord) => void;
}

interface TaskForm {
  projectId: string;
  title: string;
  description: string;
  assignedTo: string;
  priority: string;
  status: string;
  startDate: string;
  dueDate: string;
  estimatedHours: string;
  labels: string;
  billable: boolean;
  dependencyTaskIds: string[];
}

const emptyForm: TaskForm = {
  projectId: "",
  title: "",
  description: "",
  assignedTo: "",
  priority: "medium",
  status: "todo",
  startDate: "",
  dueDate: "",
  estimatedHours: "",
  labels: "",
  billable: true,
  dependencyTaskIds: [],
};

export default function TaskFormModal({
  open,
  task,
  defaultProjectId,
  onClose,
  onSaved,
}: TaskFormModalProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectTasks, setProjectTasks] = useState<
    Array<{ _id: string; title: string; status: string }>
  >([]);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reset to the task being edited (or a fresh form).
    setForm(
      task
        ? {
            projectId:
              typeof task.projectId === "object" ? task.projectId._id : task.projectId,
            title: task.title,
            description: task.description || "",
            assignedTo:
              typeof task.assignedTo === "object" ? task.assignedTo._id : task.assignedTo,
            priority: task.priority,
            status: task.status,
            startDate: task.startDate ? task.startDate.slice(0, 10) : "",
            dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
            estimatedHours:
              task.estimatedHours !== null && task.estimatedHours !== undefined
                ? String(task.estimatedHours)
                : "",
            labels: (task.labels || []).join(", "),
            billable: task.billable !== false,
            dependencyTaskIds: (task.dependencyTaskIds || []).map((d) =>
              typeof d === "object" ? d._id : d
            ),
          }
        : { ...emptyForm, projectId: defaultProjectId || "" }
    );
    setError("");
  }, [open, task, defaultProjectId]);

  // Load projects once on first open.
  useEffect(() => {
    if (!open) return;
    fetch("/api/projects?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProjects(data?.projects || []))
      .catch(() => {});
  }, [open]);

  // Load the selected project's tasks for dependency picking.
  useEffect(() => {
    if (!open || !form.projectId) {
      setProjectTasks([]);
      return;
    }
    fetch(`/api/tasks?projectId=${form.projectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProjectTasks(data?.tasks || []))
      .catch(() => {});
  }, [open, form.projectId]);

  if (!open) return null;

  const set = (field: keyof TaskForm, value: string | string[] | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleDependency = (id: string) => {
    setForm((f) => ({
      ...f,
      dependencyTaskIds: f.dependencyTaskIds.includes(id)
        ? f.dependencyTaskIds.filter((x) => x !== id)
        : [...f.dependencyTaskIds, id],
    }));
  };

  const selectedProject = projects.find((p) => p._id === form.projectId);
  const assignees = selectedProject?.teamMemberIds || [];
  const otherTasks = projectTasks.filter(
    (t) => !task || t._id !== task._id
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");

    if (!form.projectId || !form.title.trim() || !form.assignedTo) {
      setError("Project, title, and assignee are required");
      setSaving(false);
      return;
    }

    const body = {
      projectId: form.projectId,
      title: form.title.trim(),
      description: form.description,
      assignedTo: form.assignedTo,
      priority: form.priority,
      status: form.status,
      startDate: form.startDate || undefined,
      dueDate: form.dueDate || undefined,
      estimatedHours:
        form.estimatedHours === "" ? undefined : Number(form.estimatedHours),
      labels: form.labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
      billable: form.billable,
      dependencyTaskIds: form.dependencyTaskIds,
    };

    try {
      const res = task
        ? await fetch(`/api/tasks/${task._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save task");
      }

      const data = await res.json();
      onSaved(data.task);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>{task ? "Edit Task" : "New Task"}</h2>
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
          <div className="sm:col-span-2">
            <Field label="Project" required>
              <select
                value={form.projectId}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    projectId: e.target.value,
                    assignedTo: "",
                    dependencyTaskIds: [],
                  }))
                }
                className={inputCls}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.projectName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Implement login flow"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="What needs to be done?"
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>
          <Field label="Assign To" required>
            <select
              value={form.assignedTo}
              onChange={(e) => set("assignedTo", e.target.value)}
              className={inputCls}
            >
              <option value="">Select team member</option>
              {assignees.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.fullName || m.name}
                  {m.role ? ` (${m.role})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              className={inputCls}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputCls}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estimated Hours">
            <input
              type="number"
              min={0}
              step="0.5"
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
          <Field label="Due Date">
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Labels (comma separated)">
              <input
                type="text"
                value={form.labels}
                onChange={(e) => set("labels", e.target.value)}
                placeholder="e.g. frontend, ui, high-priority"
                className={inputCls}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(e) => set("billable", e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Billable (client is charged for logged hours)
            </span>
          </label>
          <div className="sm:col-span-2">
            <Field label="Depends On">
              {form.projectId === "" ? (
                <p className="text-sm text-zinc-400">
                  Select a project to choose dependencies.
                </p>
              ) : otherTasks.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  No other tasks in this project.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2">
                  {otherTasks.map((t) => (
                    <label
                      key={t._id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.dependencyTaskIds.includes(t._id)}
                        onChange={() => toggleDependency(t._id)}
                        className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {t.title}
                      </span>
                      <span className="text-xs text-zinc-400">{t.status}</span>
                    </label>
                  ))}
                </div>
              )}
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
            {saving ? "Saving..." : task ? "Save Changes" : "Create Task"}
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
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
