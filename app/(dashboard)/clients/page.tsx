"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import ClientFormModal, {
  ClientRecord,
  UserOption,
} from "@/components/ClientFormModal";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

const ALLOWED_ROLES = ["ceo", "hr", "project_manager", "team_lead", "accounts"];

const STATUS_BADGE: Record<string, string> = {
  lead: "badge badge-amber",
  active: "badge badge-green",
  completed: "badge badge-blue",
  "on-hold": "badge badge-gray",
};

const STATUS_LABEL: Record<string, string> = {
  lead: "Lead",
  active: "Active",
  completed: "Completed",
  "on-hold": "On Hold",
};

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "clientName:asc", label: "Name Aâ€“Z" },
  { value: "clientName:desc", label: "Name Zâ€“A" },
  { value: "contractValue:desc", label: "Contract value: highâ€“low" },
  { value: "contractValue:asc", label: "Contract value: lowâ€“high" },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

/** Lightweight debounce so the search box doesn't hammer the API per keystroke. */
function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ClientsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);

  const [accountManagers, setAccountManagers] = useState<UserOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Keep the search's initial page in sync without an effect loop.
  const previousSearch = useRef("");
  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
    if (
      status === "authenticated" &&
      role &&
      !ALLOWED_ROLES.includes(role)
    )
      redirect("/");
  }, [status, role]);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pagination.pageSize));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (managerFilter) params.set("accountManager", managerFilter);
      if (sort) {
        const [sortBy, sortOrder] = sort.split(":");
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
      }

      const res = await fetch(`/api/clients?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setClients(data.clients || []);
      setPagination(data.pagination);
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pagination.pageSize, debouncedSearch, statusFilter, managerFilter, sort]);

  const fetchAccountManagers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?status=active&pageSize=200");
      if (!res.ok) return;
      const data = await res.json();
      setAccountManagers(data.users || []);
    } catch (err) {
      console.error("Error fetching account managers:", err);
    }
  }, []);

  useEffect(() => {
    if (role && ALLOWED_ROLES.includes(role)) {
      fetchClients();
      fetchAccountManagers();
    }
  }, [role, fetchClients, fetchAccountManagers]);

  const openCreate = () => {
    setEditingClient(null);
    setModalOpen(true);
  };

  const openEdit = (client: ClientRecord) => {
    setEditingClient(client);
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteError("");
    try {
      const res = await fetch(`/api/clients/${deletingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete client");
        return;
      }
      setDeletingId(null);
      fetchClients();
    } catch (err) {
      console.error("Error deleting client:", err);
      setDeleteError("Something went wrong");
    }
  };

  if (status === "loading") {
    return <LoadingCenter />;
  }

  // Only these roles can mutate clients (matches clients.write).
  const canManage = role === "ceo" || role === "project_manager";

  const amName = (c: ClientRecord) => {
    const am = c.accountManagerId as UserOption | undefined;
    return am ? am.fullName || am.name : "â€”";
  };

  const hasFilters = search !== "" || statusFilter !== "" || managerFilter !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setManagerFilter("");
    setPage(1);
  };

  const from = pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const activeOnPage = clients.filter((c) => c.status === "active").length;
  const leadOnPage = clients.filter((c) => c.status === "lead").length;
  const contractTotalOnPage = clients.reduce((s, c) => s + (c.contractValue ?? 0), 0);

  return (
    <PageShell>
      <PageHeader
        title="Clients"
        description="Manage clients, contracts, and invoicing"
        badge={
          <span className="count-chip">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            {pagination.total} clients
          </span>
        }
        actions={
          canManage ? (
            <button onClick={openCreate} className="btn btn-primary">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Client
            </button>
          ) : undefined
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
            <div className="summary-label">Total Clients</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-green">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : activeOnPage}</div>
            <div className="summary-label">Active (page)</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-amber">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-11.516 0c.85.493 1.508 1.333 1.508 2.316V18" />
            </svg>
          </div>
          <div>
            <div className="summary-num">{loading ? "â€”" : leadOnPage}</div>
            <div className="summary-label">Leads (page)</div>
          </div>
        </div>
        <div className="summary-item">
          <div className="tile tile-sm tile-purple">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="summary-num" style={{ fontSize: 16 }}>{loading ? "â€”" : fmt(contractTotalOnPage)}</div>
            <div className="summary-label">Contract (page)</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="search-wrap" style={{ flex: "1 1 240px", minWidth: 0 }}>
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, legal name, contact, city, or GST..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 120 }}
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={managerFilter}
          onChange={(e) => { setManagerFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 140 }}
        >
          <option value="">All Account Managers</option>
          {accountManagers.map((u) => (
            <option key={u._id} value={u._id}>
              {u.fullName || u.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="input"
          style={{ width: "auto", flex: "0 0 auto", minWidth: 150 }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
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
      </FilterBar>

      {/* Desktop Table */}
      <div className="card desktop-user-table">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Industry</th>
                <th>Location</th>
                <th>Account Manager</th>
                <th>Contract Value</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    <div className="loading-center" style={{ padding: 0 }}>
                      <div className="spinner" />
                      <span>Loading clients...</span>
                    </div>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>
                    {hasFilters ? "No clients match your filters" : "No clients found"}
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <Link href={`/clients/${c._id}`} style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none" }}>
                        <div className="tile tile-sm tile-blue" style={{ width: 38, height: 38, borderRadius: "50%", fontSize: 13 }}>
                          {initials(c.clientName)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 600, color: "var(--fg)", fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.clientName}
                          </p>
                          <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.legalName || c.primaryContactEmail || c.gstNumber || "â€”"}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td>{c.industry || "â€”"}</td>
                    <td>{[c.city, c.country].filter(Boolean).join(", ") || "â€”"}</td>
                    <td style={{ fontWeight: 500 }}>{amName(c)}</td>
                    <td style={{ fontWeight: 700, color: "var(--fg)" }}>
                      {c.contractValue !== undefined && c.contractValue !== null
                        ? fmt(c.contractValue)
                        : "â€”"}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[c.status] || "badge badge-gray"}>
                        {STATUS_LABEL[c.status] || c.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <Link
                          href={`/clients/${c._id}`}
                          className="icon-btn"
                          title="View client"
                        >
                          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </Link>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEdit(c)}
                              className="icon-btn primary"
                              title="Edit client"
                            >
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeletingId(c._id)}
                              className="icon-btn danger"
                              title="Delete client"
                            >
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="mobile-user-list space-y-3">
        {loading ? (
          <div className="card">
            <div className="loading-center" style={{ padding: "40px 20px" }}>
              <div className="spinner" />
              <span>Loading clients...</span>
            </div>
          </div>
        ) : clients.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>
                {hasFilters ? "No matching clients" : "No clients yet"}
              </p>
              <p>{hasFilters ? "Try clearing the filters." : "Click â€œAdd Clientâ€ to create one."}</p>
            </div>
          </div>
        ) : (
          clients.map((c) => (
            <div key={c._id} className="user-card">
              <Link href={`/clients/${c._id}`} style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: 1, textDecoration: "none" }}>
                <div className="tile tile-sm tile-blue" style={{ width: 42, height: 42, borderRadius: "50%", fontSize: 14 }}>
                  {initials(c.clientName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.clientName}
                    </p>
                    <span className={STATUS_BADGE[c.status] || "badge badge-gray"} style={{ fontSize: 10.5 }}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[c.city, c.country].filter(Boolean).join(", ") || c.industry || "â€”"}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                      AM: {amName(c)}
                    </span>
                    {c.contractValue !== undefined && c.contractValue !== null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
                        {fmt(c.contractValue)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              {canManage && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(c)}
                    className="icon-btn primary"
                    title="Edit client"
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeletingId(c._id)}
                    className="icon-btn danger"
                    title="Delete client"
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0 }}>
            Showing{" "}
            <span style={{ fontWeight: 700, color: "var(--fg)" }}>{from}â€“{to}</span>{" "}
            of <span style={{ fontWeight: 700, color: "var(--fg)" }}>{pagination.total}</span> clients
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

      {/* Create/Edit Modal */}
      <ClientFormModal
        open={modalOpen}
        client={editingClient}
        accountManagers={accountManagers}
        onClose={() => setModalOpen(false)}
        onSaved={fetchClients}
      />

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Delete Client</h2>
              <button
                onClick={() => { setDeletingId(null); setDeleteError(""); }}
                className="icon-btn"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--fg-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
                This will remove the client from lists. Its projects and invoices
                are kept for the audit trail.
              </p>
              {deleteError && (
                <div className="alert alert-error" style={{ marginTop: 14 }}>
                  {deleteError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                onClick={() => { setDeletingId(null); setDeleteError(""); }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button onClick={handleDelete} className="btn btn-danger">Delete Client</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}