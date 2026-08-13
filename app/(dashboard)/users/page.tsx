"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

interface Department {
  _id: string;
  name: string;
}

interface User {
  _id: string;
  fullName: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  departmentId?: Department | null;
  designation?: string;
  employeeId?: string;
  joiningDate?: string;
  salary?: number;
  status: "active" | "inactive";
  profileImage?: string;
  createdAt: string;
}

interface UserForm {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  departmentId: string;
  designation: string;
  employeeId: string;
  joiningDate: string;
  salary: string;
  status: "active" | "inactive";
  profileImage: string;
}

const ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: "hr", label: "HR" },
  { key: "project_manager", label: "Project Manager" },
  { key: "team_lead", label: "Team Lead" },
  { key: "employee", label: "Employee" },
  { key: "accounts", label: "Accounts" },
];

const ROLE_GRADIENTS: Record<string, string> = {
  ceo: "linear-gradient(135deg,#8b5cf6,#a78bfa)",
  hr: "linear-gradient(135deg,#f43f5e,#fb7185)",
  project_manager: "linear-gradient(135deg,#1d6af5,#0ea5e9)",
  team_lead: "linear-gradient(135deg,#06b6d4,#38bdf8)",
  employee: "linear-gradient(135deg,#64748b,#94a3b8)",
  accounts: "linear-gradient(135deg,#10b981,#34d399)",
};

const emptyForm: UserForm = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  role: "employee",
  departmentId: "",
  designation: "",
  employeeId: "",
  joiningDate: "",
  salary: "",
  status: "active",
  profileImage: "",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

const AVATAR_TILE_MAP: Record<string, string> = {
  ceo: "tile-purple",
  hr: "tile-rose",
  project_manager: "tile-blue",
  team_lead: "tile-cyan",
  employee: "tile-green",
  accounts: "tile-amber",
};

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function UserAvatar({
  user,
  size = 38,
  rounded = "50%",
}: {
  user: User;
  size?: number;
  rounded?: string;
}) {
  const name = user.fullName || user.name;
  const grad = ROLE_GRADIENTS[user.role] || ROLE_GRADIENTS.employee;

  if (user.profileImage) {
    return (
      <img
        src={user.profileImage}
        alt=""
        style={{ width: size, height: size, borderRadius: rounded, objectFit: "cover", flexShrink: 0 }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  if (rounded === "12px") {
    return (
      <div className="emp-avatar" style={{ width: size, height: size, background: grad, fontSize: size * 0.34 }}>
        {initials(name)}
      </div>
    );
  }

  return (
    <div
      className={`tile tile-sm ${AVATAR_TILE_MAP[user.role] || "tile-blue"}`}
      style={{ width: size, height: size, borderRadius: rounded, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </div>
  );
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 15,
    total: 0,
    totalPages: 1,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const previousSearch = useRef("");
  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
    if (status === "authenticated" && role !== "ceo" && role !== "hr")
      redirect("/");
  }, [status, role]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pagination.pageSize));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (departmentFilter) params.set("departmentId", departmentFilter);

      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data.users || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pagination.pageSize, debouncedSearch, roleFilter, statusFilter, departmentFilter]);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) return;
      const data = await res.json();
      setDepartments(data.departments || []);
    } catch (err) {
      console.error("Error fetching departments:", err);
    }
  }, []);

  useEffect(() => {
    if (role === "ceo" || role === "hr") {
      fetchUsers();
      fetchDepartments();
    }
  }, [role, fetchUsers, fetchDepartments]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingId(user._id);
    setForm({
      fullName: user.fullName || user.name || "",
      email: user.email,
      phone: user.phone || "",
      password: "",
      role: user.role,
      departmentId: user.departmentId?._id || "",
      designation: user.designation || "",
      employeeId: user.employeeId || "",
      joiningDate: user.joiningDate ? user.joiningDate.slice(0, 10) : "",
      salary: user.salary !== undefined && user.salary !== null ? String(user.salary) : "",
      status: user.status || "active",
      profileImage: user.profileImage || "",
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      fullName: form.fullName,
      email: form.email,
      role: form.role,
      departmentId: form.departmentId || undefined,
      designation: form.designation,
      employeeId: form.employeeId,
      joiningDate: form.joiningDate || undefined,
      salary: form.salary === "" ? undefined : Number(form.salary),
      status: form.status,
      phone: form.phone || undefined,
      profileImage: form.profileImage || undefined,
    };
    if (form.password) body.password = form.password;

    try {
      const res = editingId
        ? await fetch(`/api/users/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save user");
      }

      setModalOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete user");
        return;
      }
      setDeletingId(null);
      fetchUsers();
    } catch (err) {
      console.error("Error deleting user:", err);
    }
  };

  const hasFilters =
    search !== "" || roleFilter !== "" || statusFilter !== "" || departmentFilter !== "";

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
    setDepartmentFilter("");
    setPage(1);
  };

  const activeCount = users.filter((u) => u.status === "active").length;
  const inactiveCount = users.filter((u) => u.status === "inactive").length;

  const from = pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.total);

  if (status === "loading") return <LoadingCenter />;

  const renderActions = (user: User) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
      <button onClick={() => openEditModal(user)} className="icon-btn primary" title="Edit employee">
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      </button>
      {user.role !== "ceo" && (
        <button onClick={() => setDeletingId(user._id)} className="icon-btn danger" title="Delete employee">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      )}
    </div>
  );

  const emptyState = (
    <div className="empty-state">
      <div className="icon">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      </div>
      <p style={{ fontWeight: 600, color: "var(--fg)" }}>
        {hasFilters ? "No matching employees" : "No employees yet"}
      </p>
      <p>{hasFilters ? "Try adjusting your filters." : "Add your first team member to get started."}</p>
      {!hasFilters && (
        <button onClick={openCreateModal} className="btn btn-primary" style={{ marginTop: 16 }}>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Employee
        </button>
      )}
      {hasFilters && (
        <button onClick={clearFilters} className="btn btn-ghost" style={{ marginTop: 16 }}>
          Clear filters
        </button>
      )}
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        title="Employee Management"
        description="Manage all employees, departments, and roles"
        badge={
          <span className="count-chip">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            {pagination.total} employees
          </span>
        }
        actions={
          <button onClick={openCreateModal} className="btn btn-primary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Employee
          </button>
        }
      />

      {/* Summary strip */}
      <div className="summary-strip">
        <div className="summary-item">
          <div className="tile tile-sm tile-blue">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : pagination.total}</div>
            <div className="summary-label">Total Employees</div>
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
            <div className="summary-label">Active (page)</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-rose">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : inactiveCount}</div>
            <div className="summary-label">Inactive (page)</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-purple">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{departments.length}</div>
            <div className="summary-label">Departments</div>
          </div>
        </div>
      </div>

      <FilterBar>
        <div className="search-wrap" style={{ flex: "1 1 240px", minWidth: 0 }}>
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search name, email, ID, designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ flex: "0 0 auto", width: "auto", minWidth: 130 }}
        >
          <option value="">All Roles</option>
          <option value="ceo">CEO</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <select
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ flex: "0 0 auto", width: "auto", minWidth: 140 }}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="btn btn-ghost" style={{ padding: "8px 14px" }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
        <div className="view-toggle desktop-user-table" style={{ flexShrink: 0 }}>
          <button
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
            title="Table view"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </button>
          <button
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
        </div>
      </FilterBar>

      {/* Status quick filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {(["", "active", "inactive"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`filter-chip${statusFilter === s ? " active" : ""}`}
          >
            {s === "" ? "All Status" : s === "active" ? "Active" : "Inactive"}
          </button>
        ))}
      </div>

      {/* Desktop Table View */}
      {viewMode === "table" && (
        <div className="card desktop-user-table">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          <div className="skeleton" style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div className="skeleton" style={{ height: 12, width: 120, marginBottom: 6 }} />
                            <div className="skeleton" style={{ height: 10, width: 160 }} />
                          </div>
                        </div>
                      </td>
                      <td><div className="skeleton" style={{ height: 22, width: 80, borderRadius: 99 }} /></td>
                      <td><div className="skeleton" style={{ height: 12, width: 90 }} /></td>
                      <td><div className="skeleton" style={{ height: 12, width: 110 }} /></td>
                      <td><div className="skeleton" style={{ height: 22, width: 60, borderRadius: 99 }} /></td>
                      <td><div className="skeleton" style={{ height: 12, width: 80 }} /></td>
                      <td />
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 0, border: "none" }}>
                      {emptyState}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user._id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          <UserAvatar user={user} />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontWeight: 600, color: "var(--fg)", fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {user.fullName || user.name}
                            </p>
                            <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {user.email}
                            </p>
                            {user.employeeId && (
                              <p style={{ fontSize: 10.5, color: "var(--fg-subtle)", margin: "2px 0 0", fontWeight: 600, letterSpacing: "0.03em" }}>
                                {user.employeeId}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td><RoleBadge role={user.role} /></td>
                      <td style={{ fontSize: 13 }}>{user.departmentId?.name || "â€”"}</td>
                      <td style={{ fontSize: 13 }}>{user.designation || "â€”"}</td>
                      <td>
                        <span className={user.status === "active" ? "badge badge-green" : "badge badge-rose"}>
                          {user.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                        {user.joiningDate
                          ? new Date(user.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ textAlign: "right" }}>{renderActions(user)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Desktop Grid View */}
      {viewMode === "grid" && (
        <div className="desktop-user-table">
          {loading ? (
            <div className="emp-grid">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                    <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
                    <div style={{ flex: 1 }}>
                      <div className="skeleton" style={{ height: 13, width: 120, marginBottom: 6 }} />
                      <div className="skeleton" style={{ height: 11, width: 150 }} />
                    </div>
                  </div>
                  <div className="skeleton" style={{ height: 11, width: 100 }} />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="card">{emptyState}</div>
          ) : (
            <div className="emp-grid">
              {users.map((user) => {
                const grad = ROLE_GRADIENTS[user.role] || ROLE_GRADIENTS.employee;
                return (
                  <div
                    key={user._id}
                    className="card card-hover emp-card"
                    style={{ "--emp-grad": grad } as React.CSSProperties}
                  >
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <UserAvatar user={user} size={40} rounded="12px" />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontWeight: 700, fontSize: 13.5, color: "var(--fg)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {user.fullName || user.name}
                            </p>
                            <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <span className={user.status === "active" ? "badge badge-green" : "badge badge-rose"} style={{ fontSize: 10, flexShrink: 0 }}>
                          {user.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <RoleBadge role={user.role} />
                        {user.departmentId?.name && (
                          <span className="badge badge-gray" style={{ fontSize: 10.5 }}>{user.departmentId.name}</span>
                        )}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: "var(--fg-muted)" }}>
                        {user.designation || "No designation"}
                        {user.employeeId && (
                          <span style={{ marginLeft: 8, color: "var(--fg-subtle)", fontWeight: 600 }}>Â· {user.employeeId}</span>
                        )}
                      </div>
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>
                          Joined {user.joiningDate
                            ? new Date(user.joiningDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                            : new Date(user.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                        </span>
                        {renderActions(user)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mobile Cards */}
      <div className="mobile-user-list space-y-3">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="user-card">
              <div className="skeleton" style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 13, width: 130, marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 11, width: 170 }} />
              </div>
            </div>
          ))
        ) : users.length === 0 ? (
          <div className="card">{emptyState}</div>
        ) : (
          users.map((user) => {
            const grad = ROLE_GRADIENTS[user.role] || ROLE_GRADIENTS.employee;
            return (
              <div
                key={user._id}
                className="user-card emp-card"
                style={{ "--emp-grad": grad } as React.CSSProperties}
              >
                <UserAvatar user={user} size={42} rounded="12px" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.fullName || user.name}
                    </p>
                    <RoleBadge role={user.role} />
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.email}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <span className="badge badge-gray">
                      {user.departmentId?.name || "No dept"}
                    </span>
                    <span className={user.status === "active" ? "badge badge-green" : "badge badge-rose"}>
                      {user.status === "active" ? "Active" : "Inactive"}
                    </span>
                    {user.designation && (
                      <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{user.designation}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => openEditModal(user)} className="icon-btn primary" title="Edit employee">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  {user.role !== "ceo" && (
                    <button onClick={() => setDeletingId(user._id)} className="icon-btn danger" title="Delete employee">
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0 }}>
            Showing{" "}
            <span style={{ fontWeight: 700, color: "var(--fg)" }}>{from}â€“{to}</span>{" "}
            of <span style={{ fontWeight: 700, color: "var(--fg)" }}>{pagination.total}</span> employees
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="btn btn-ghost"
              style={{ padding: "8px 16px" }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Previous
            </button>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="btn btn-ghost"
              style={{ padding: "8px 16px" }}
            >
              Next
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>{editingId ? "Edit Employee" : "Add New Employee"}</h2>
              <button onClick={() => setModalOpen(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {error && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name" required>
                  <input type="text" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Full name" className="input" />
                </Field>
                <Field label="Email" required>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@company.com" className="input" />
                </Field>
                <Field label="Phone">
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" className="input" />
                </Field>
                <Field label="Role">
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">
                    {ROLE_OPTIONS.map((r) => (<option key={r.key} value={r.key}>{r.label}</option>))}
                  </select>
                </Field>
                <Field label="Department">
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input">
                    <option value="">No department</option>
                    {departments.map((d) => (<option key={d._id} value={d._id}>{d.name}</option>))}
                  </select>
                </Field>
                <Field label="Designation">
                  <input type="text" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Software Engineer" className="input" />
                </Field>
                <Field label="Employee ID">
                  <input type="text" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="EMP-0001" className="input" />
                </Field>
                <Field label="Joining Date">
                  <input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="input" />
                </Field>
                <Field label="Salary (per month)">
                  <input type="number" min={0} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="0" className="input" />
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })} className="input">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
                <Field label="Password" hint={editingId ? "Leave blank to keep current" : undefined}>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editingId ? "New password" : "At least 6 characters"} className="input" />
                </Field>
                <Field label="Profile Image URL">
                  <input type="text" value={form.profileImage} onChange={(e) => setForm({ ...form, profileImage: e.target.value })} placeholder="https://..." className="input" />
                </Field>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Delete Employee</h2>
              <button onClick={() => setDeletingId(null)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--fg-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
                Are you sure you want to delete this employee? This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeletingId(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(deletingId)} className="btn btn-danger">Delete Employee</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
        {label}
        {required && <span style={{ color: "#f43f5e" }}> *</span>}
        {hint && <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 400 }}> ({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const ROLE_BADGE_MAP: Record<string, string> = {
  ceo: "badge badge-purple",
  hr: "badge badge-rose",
  project_manager: "badge badge-blue",
  team_lead: "badge badge-cyan",
  employee: "badge badge-gray",
  accounts: "badge badge-green",
};

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_OPTIONS.find((r) => r.key === role)?.label ||
    (role === "ceo" ? "CEO" : role);
  return (
    <span className={ROLE_BADGE_MAP[role] || "badge badge-gray"}>
      {label}
    </span>
  );
}
