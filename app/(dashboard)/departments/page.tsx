"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

interface Department {
  _id: string;
  name: string;
  description?: string;
  managerId?: { _id: string; fullName: string; name: string; email: string } | null;
  isActive: boolean;
  memberCount?: number;
}

interface UserOption {
  _id: string;
  fullName: string;
  name: string;
  email: string;
}

interface DeptForm {
  name: string;
  description: string;
  managerId: string;
}

const emptyForm: DeptForm = { name: "", description: "", managerId: "" };

const DEPT_COLORS = [
  "linear-gradient(135deg,#1d6af5,#0ea5e9)",
  "linear-gradient(135deg,#8b5cf6,#a78bfa)",
  "linear-gradient(135deg,#10b981,#34d399)",
  "linear-gradient(135deg,#f59e0b,#fbbf24)",
  "linear-gradient(135deg,#f43f5e,#fb7185)",
  "linear-gradient(135deg,#06b6d4,#38bdf8)",
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

export default function DepartmentsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DeptForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
    if (status === "authenticated" && role !== "ceo" && role !== "hr") redirect("/");
  }, [status, role]);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDepartments(data.departments || []);
    } catch (err) {
      console.error("Error fetching departments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (role === "ceo" || role === "hr") {
      fetchDepartments();
      fetchUsers();
    }
  }, [role, fetchDepartments, fetchUsers]);

  const openCreateModal = () => { setEditingId(null); setForm(emptyForm); setError(""); setModalOpen(true); };
  const openEditModal = (dept: Department) => {
    setEditingId(dept._id);
    setForm({ name: dept.name, description: dept.description || "", managerId: dept.managerId?._id || "" });
    setError(""); setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    const body: Record<string, unknown> = { name: form.name, description: form.description, managerId: form.managerId || undefined };
    try {
      const res = editingId
        ? await fetch(`/api/departments/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to save department"); }
      setModalOpen(false); fetchDepartments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save department");
    } finally { setSaving(false); }
  };

  const toggleActive = async (dept: Department) => {
    try {
      const res = await fetch(`/api/departments/${dept._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !dept.isActive }) });
      if (!res.ok) { const data = await res.json(); alert(data.error || "Failed to update department"); return; }
      fetchDepartments();
    } catch (err) { console.error("Error updating department:", err); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json(); alert(data.error || "Failed to delete department"); return; }
      setDeletingId(null); fetchDepartments();
    } catch (err) { console.error("Error deleting department:", err); }
  };

  const activeCount = departments.filter((d) => d.isActive).length;
  const totalMembers = departments.reduce((sum, d) => sum + (d.memberCount || 0), 0);

  if (status === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Departments"
        description="Organize your company into departments and teams"
        badge={
          <span className="count-chip">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
            {departments.length} departments
          </span>
        }
        actions={
          <button onClick={openCreateModal} className="btn btn-primary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Department
          </button>
        }
      />

      {/* Summary strip */}
      <div className="summary-strip">
        <div className="summary-item">
          <div className="tile tile-sm tile-blue">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : departments.length}</div>
            <div className="summary-label">Departments</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-green">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : activeCount}</div>
            <div className="summary-label">Active</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-purple">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : totalMembers}</div>
            <div className="summary-label">Total Members</div>
          </div>
        </div>
      </div>

      {/* Departments Grid */}
      {loading ? (
        <div className="grid-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div className="skeleton" style={{ height: 44, width: 44, marginBottom: 14, borderRadius: 12 }} />
              <div className="skeleton" style={{ height: 14, width: 110, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 11, width: 160, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 11, width: 90 }} />
            </div>
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: "var(--fg)" }}>No departments yet</p>
            <p>Click &ldquo;Add Department&rdquo; to create one.</p>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {departments.map((dept, idx) => {
            const grad = DEPT_COLORS[idx % DEPT_COLORS.length];
            return (
              <div
                key={dept._id}
                className="card card-hover dept-card"
                style={{ "--dept-grad": grad } as React.CSSProperties}
              >
                <div style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <div className="dept-icon" style={{ background: grad }}>
                        {initials(dept.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <h3 style={{ fontWeight: 700, fontSize: 14.5, color: "var(--fg)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dept.name}</h3>
                          {!dept.isActive && <span className="badge badge-gray" style={{ fontSize: 10 }}>Inactive</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--fg-subtle)", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {dept.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => openEditModal(dept)} className="icon-btn primary" title="Edit department">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button onClick={() => toggleActive(dept)} className="icon-btn" title={dept.isActive ? "Deactivate" : "Activate"} style={{ color: dept.isActive ? "var(--accent-amber)" : "var(--accent-green)" }}>
                        {dept.isActive ? (
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        )}
                      </button>
                      <button onClick={() => setDeletingId(dept._id)} className="icon-btn danger" title="Delete department">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-muted)", minWidth: 0, overflow: "hidden" }}>
                      {dept.managerId?.fullName || dept.managerId?.name ? (
                        <>
                          <span
                            className="tile tile-sm tile-blue"
                            style={{ width: 24, height: 24, borderRadius: "50%", fontSize: 10 }}
                          >
                            {initials(dept.managerId?.fullName || dept.managerId?.name || "")}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ color: "var(--fg-subtle)" }}>Manager: </span>
                            <span style={{ fontWeight: 600, color: "var(--fg)" }}>{dept.managerId?.fullName || dept.managerId?.name}</span>
                          </span>
                        </>
                      ) : (
                        <span style={{ color: "var(--fg-subtle)" }}>No manager assigned</span>
                      )}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--primary)", flexShrink: 0 }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                      </svg>
                      {dept.memberCount ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>{editingId ? "Edit Department" : "Add New Department"}</h2>
              <button onClick={() => setModalOpen(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>Department Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Engineering" className="input" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this department do?" rows={3} className="input" style={{ resize: "vertical" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>Department Manager</label>
                  <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })} className="input">
                    <option value="">Not assigned</option>
                    {users.map((u) => (<option key={u._id} value={u._id}>{u.fullName || u.name} â€” {u.email}</option>))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create Department"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h2>Delete Department</h2></div>
            <div className="modal-body">
              <p style={{ color: "var(--fg-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
                Members will be unassigned from this department. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeletingId(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(deletingId)} className="btn btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}