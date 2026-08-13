"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

interface Role {
  _id: string;
  name: string;
  key: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  userCount?: number;
}

interface Permission {
  _id: string;
  key: string;
  name: string;
  module: string;
  description: string;
}

interface RoleForm {
  name: string;
  key: string;
  description: string;
  permissions: string[];
}

const emptyForm: RoleForm = { name: "", key: "", description: "", permissions: [] };

const ROLE_COLORS: Record<string, string> = {
  ceo: "linear-gradient(135deg,#8b5cf6,#a78bfa)",
  hr: "linear-gradient(135deg,#f43f5e,#fb7185)",
  project_manager: "linear-gradient(135deg,#1d6af5,#0ea5e9)",
  team_lead: "linear-gradient(135deg,#06b6d4,#38bdf8)",
  employee: "linear-gradient(135deg,#64748b,#94a3b8)",
  accounts: "linear-gradient(135deg,#10b981,#34d399)",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

export default function RolesPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
    if (status === "authenticated" && role !== "ceo" && role !== "hr") redirect("/");
  }, [status, role]);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRoles(data.roles || []);
    } catch (err) { console.error("Error fetching roles:", err); }
    finally { setLoading(false); }
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions");
      if (!res.ok) return;
      const data = await res.json();
      setPermissions(data.permissions || []);
    } catch (err) { console.error("Error fetching permissions:", err); }
  }, []);

  useEffect(() => {
    if (role === "ceo" || role === "hr") { fetchRoles(); fetchPermissions(); }
  }, [role, fetchRoles, fetchPermissions]);

  const modules = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const openCreateModal = () => { setEditing(null); setForm(emptyForm); setError(""); setModalOpen(true); };
  const openEditModal = (r: Role) => {
    setEditing(r);
    setForm({ name: r.name, key: r.key, description: r.description || "", permissions: [...r.permissions] });
    setError(""); setModalOpen(true);
  };
  const togglePermission = (key: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key) ? prev.permissions.filter((p) => p !== key) : [...prev.permissions, key],
    }));
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    const body: Record<string, unknown> = { name: form.name, description: form.description, permissions: form.permissions };
    if (!editing) body.key = form.key;
    try {
      const res = editing
        ? await fetch(`/api/roles/${editing._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to save role"); }
      setModalOpen(false); fetchRoles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json(); alert(data.error || "Failed to delete role"); return; }
      setDeletingId(null); fetchRoles();
    } catch (err) { console.error("Error deleting role:", err); }
  };

  if (status === "loading") {
    return <LoadingCenter />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Roles & Permissions"
        description="Control what each role can see and do in the workspace"
        badge={
          <span className="count-chip">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            {roles.length} roles
          </span>
        }
        actions={
          <button onClick={openCreateModal} className="btn btn-primary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Role
          </button>
        }
      />

      {/* Summary strip */}
      {!loading && roles.length > 0 && (
        <div className="summary-strip">
          <div className="summary-item">
            <div className="tile tile-sm tile-blue">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{roles.length}</div>
              <div className="summary-label">Total Roles</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-purple">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{roles.filter((r) => r.isSystem).length}</div>
              <div className="summary-label">System Roles</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-green">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{roles.filter((r) => !r.isSystem).length}</div>
              <div className="summary-label">Custom Roles</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="tile tile-sm tile-amber">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <div className="summary-num">{roles.reduce((s, r) => s + (r.userCount || 0), 0)}</div>
              <div className="summary-label">Assigned Users</div>
            </div>
          </div>
        </div>
      )}

      {/* Roles Grid */}
      {loading ? (
        <div className="grid-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div className="skeleton" style={{ height: 14, width: 96, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 11, width: 64, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 11, width: 128 }} />
            </div>
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: "var(--fg)" }}>No roles yet</p>
            <p>Run the migration to provision system roles, or click &ldquo;Add Role&rdquo;.</p>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {roles.map((r) => {
            const grad = ROLE_COLORS[r.key] || "linear-gradient(135deg,#1d6af5,#0ea5e9)";
            return (
              <div key={r._id} className="card card-hover">
                <div style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <div className="dept-icon" style={{ background: grad }}>
                        {initials(r.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <h3 style={{ fontWeight: 700, fontSize: 14, color: "var(--fg)", margin: 0 }}>{r.name}</h3>
                          {r.isSystem && <span className="badge badge-blue" style={{ fontSize: 10 }}>System</span>}
                        </div>
                        <p style={{ fontSize: 11, color: "var(--fg-subtle)", margin: "2px 0 0", fontFamily: "monospace" }}>{r.key}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => openEditModal(r)} className="icon-btn primary" title="Edit role">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      {!r.isSystem && (
                        <button onClick={() => setDeletingId(r._id)} className="icon-btn danger" title="Delete role">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {r.description && (
                    <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>{r.description}</p>
                  )}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                      <span style={{ fontWeight: 700, color: "var(--fg)" }}>{r.permissions.length}</span> permissions
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                      </svg>
                      {r.userCount ?? 0} users
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
          <div className="modal-box" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>{editing ? `Edit ${editing.name}` : "Add New Role"}</h2>
              <button onClick={() => setModalOpen(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>Role Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Finance Manager" className="input" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>
                    Key {editing?.isSystem && <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 400 }}>(locked for system roles)</span>}
                  </label>
                  <input type="text" value={form.key} disabled={!!editing?.isSystem} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="finance_manager" className="input" style={editing?.isSystem ? { opacity: 0.5, cursor: "not-allowed" } : {}} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What can this role do?" rows={2} className="input" style={{ resize: "vertical" }} />
                </div>
              </div>

              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Permissions</label>
              {Object.keys(modules).length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>Loading permissions...</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(modules).map(([module, perms]) => (
                    <div key={module} style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 10 }}>{module}</p>
                      <div className="grid-2">
                        {perms.map((p) => (
                          <label key={p.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(p.key)}
                              onChange={() => togglePermission(p.key)}
                              style={{ marginTop: 2, accentColor: "var(--primary)", flexShrink: 0 }}
                            />
                            <span style={{ fontSize: 12.5, color: "var(--fg)" }}>
                              {p.name}
                              <span style={{ display: "block", fontSize: 11, color: "var(--fg-subtle)" }}>{p.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h2>Delete Role</h2></div>
            <div className="modal-body">
              <p style={{ color: "var(--fg-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
                Are you sure you want to delete this role? Users assigned to it must be reassigned first.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeletingId(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(deletingId)} className="btn btn-danger">Delete Role</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
