"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import LeadFormModal, {
  LeadRecord,
  UserOption,
  LEAD_STAGES_UI,
  STAGE_LABELS,
} from "@/components/LeadFormModal";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

const CRM_ROLES = ["ceo", "hr", "project_manager", "team_lead", "accounts"];

const COLUMNS = [
  { key: "lead", label: "Lead", dot: "dot-gray" },
  { key: "qualified", label: "Qualified", dot: "dot-blue" },
  { key: "proposal", label: "Proposal", dot: "dot-purple" },
  { key: "negotiation", label: "Negotiation", dot: "dot-amber" },
  { key: "won", label: "Won", dot: "dot-green" },
  { key: "lost", label: "Lost", dot: "dot-rose" },
];

const AVATAR_TONE: Record<string, string> = {
  lead: "tile-blue",
  qualified: "tile-cyan",
  proposal: "tile-purple",
  negotiation: "tile-amber",
  won: "tile-green",
  lost: "tile-rose",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

interface Analytics {
  funnel: { stage: string; count: number; value: number }[];
  totals: {
    totalLeads: number;
    totalValue: number;
    openCount: number;
    openValue: number;
    wonCount: number;
    wonValue: number;
    lostCount: number;
    lostValue: number;
    winRate: number;
    conversionRate: number;
    avgDaysToClose: number | null;
  };
  bySource: { source: string; count: number; wonCount: number; wonValue: number }[];
  byOwner: { ownerId: string; owner: UserOption | null; count: number; openValue: number }[];
}

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CrmBoardPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [sourceFilter, setSourceFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
    if (status === "authenticated" && role && !CRM_ROLES.includes(role))
      redirect("/");
  }, [status, role]);

  const fetchBoard = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("pageSize", "100");
      params.set("sortBy", "stageChangedAt");
      params.set("sortOrder", "desc");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (sourceFilter) params.set("source", sourceFilter);
      if (ownerFilter) params.set("owner", ownerFilter);

      const [leadsRes, analyticsRes] = await Promise.all([
        fetch(`/api/leads?${params}`),
        fetch("/api/crm/analytics"),
      ]);
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeads(data.leads || []);
        setSources(data.sources || []);
      }
      if (analyticsRes.ok) {
        setAnalytics(await analyticsRes.json());
      }
    } catch (err) {
      console.error("Error fetching CRM board:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sourceFilter, ownerFilter]);

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
    if (role && CRM_ROLES.includes(role)) {
      fetchBoard();
      fetchUsers();
    }
  }, [role, fetchBoard, fetchUsers]);

  const openCreate = () => {
    setEditingLead(null);
    setModalOpen(true);
  };

  const openEdit = (lead: LeadRecord) => {
    setEditingLead(lead);
    setModalOpen(true);
  };

  /** Move a lead to another stage via the stage endpoint. */
  const moveLead = async (leadId: string, toStage: string) => {
    if (movingId) return;
    setMovingId(leadId);
    setMoveError("");
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: toStage }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMoveError(data.error || "Failed to move lead");
        return;
      }
      await fetchBoard();
    } catch (err) {
      console.error("Error moving lead:", err);
      setMoveError("Something went wrong");
    } finally {
      setMovingId(null);
    }
  };

  if (status === "loading") {
    return <LoadingCenter />;
  }

  const canManage = role === "ceo" || role === "project_manager";
  const ownerName = (l: LeadRecord) => {
    const o = l.ownerId as UserOption | undefined;
    return o ? o.fullName || o.name : "Unassigned";
  };

  const grouped = COLUMNS.map((col) => ({
    ...col,
    leads: leads.filter((l) => l.stage === col.key),
  }));

  const summary = analytics?.totals;

  return (
    <PageShell>
      <PageHeader
        title="Sales Pipeline"
        description="Track leads from first contact to closed-won"
        badge={leads.length > 0 ? <span className="count-chip">{leads.length} leads</span> : undefined}
        actions={
          <>
            <Link href="/crm/reminders" className="btn btn-ghost">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              Reminders
            </Link>
            {canManage && (
              <button onClick={openCreate} className="btn btn-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Lead
              </button>
            )}
          </>
        }
      />

      {/* Summary strip */}
      {summary && (
        <div className="summary-strip">
          <div className="summary-item">
            <span className="tile tile-blue">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v15.75m-13.5-1.5H21m-1.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-7.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
            </span>
            <div>
              <p className="summary-num">{fmt(summary.openValue)}</p>
              <p className="summary-label">Pipeline Value Â· {summary.openCount} open</p>
            </div>
          </div>
          <div className="summary-item">
            <span className="tile tile-green">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </span>
            <div>
              <p className="summary-num">{fmt(summary.wonValue)}</p>
              <p className="summary-label">Won Â· {summary.wonCount} deals</p>
            </div>
          </div>
          <div className="summary-item">
            <span className="tile tile-amber">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" /></svg>
            </span>
            <div>
              <p className="summary-num">{summary.winRate}%</p>
              <p className="summary-label">Win Rate Â· {summary.lostCount} lost</p>
            </div>
          </div>
          <div className="summary-item">
            <span className="tile tile-purple">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </span>
            <div>
              <p className="summary-num">{summary.avgDaysToClose !== null ? `${Math.round(summary.avgDaysToClose * 10) / 10}` : "â€”"}</p>
              <p className="summary-label">Avg. Days to Close</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <FilterBar>
        <div className="search-wrap flex-1">
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by company, contact, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="input lg:w-48"
        >
          <option value="">All Sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="input lg:w-48"
        >
          <option value="">All Owners</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>{u.fullName || u.name}</option>
          ))}
        </select>
      </FilterBar>

      {moveError && (
        <div className="alert alert-error">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{moveError}</span>
        </div>
      )}

      {/* Board */}
      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
          <p>Loading pipeline...</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {grouped.map((col) => {
            const colValue = col.leads.reduce(
              (s, l) => s + (l.estimatedValue || 0),
              0
            );
            return (
              <div key={col.key} className="kanban-col">
                {/* Column header */}
                <div className="kanban-col-head">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`dot ${col.dot}`} />
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {col.label}
                    </span>
                    <span className="count-chip" style={{ padding: "2px 9px", fontSize: 10.5 }}>
                      {col.leads.length}
                    </span>
                  </div>
                  {colValue > 0 && (
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      {fmt(colValue)}
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div className="kanban-col-body">
                  {col.leads.length === 0 ? (
                    <p className="text-center text-xs text-zinc-400 py-8">
                      No leads here
                    </p>
                  ) : (
                    col.leads.map((lead) => (
                      <div
                        key={lead._id}
                        className={`kanban-card ${
                          lead.stage === "won"
                            ? "border-emerald-300 dark:border-emerald-700"
                            : lead.stage === "lost"
                            ? "opacity-60 border-red-200 dark:border-red-800"
                            : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/leads/${lead._id}`} className="min-w-0 group">
                            <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              {lead.companyName}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                              {lead.contactName || lead.email || lead.phone || "â€”"}
                            </p>
                          </Link>
                          <span className="shrink-0 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            {lead.estimatedValue !== undefined &&
                            lead.estimatedValue !== null
                              ? fmt(lead.estimatedValue)
                              : "â€”"}
                          </span>
                        </div>

                        {lead.source && (
                          <span className="badge badge-blue mt-2.5">
                            {lead.source}
                          </span>
                        )}

                        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`tile tile-sm ${AVATAR_TONE[lead.stage] || "tile-blue"}`} style={{ width: 24, height: 24, borderRadius: "50%", fontSize: 9 }}>
                              {ownerName(lead).charAt(0).toUpperCase()}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {ownerName(lead)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {canManage && (
                              <>
                                <button
                                  onClick={() =>
                                    moveLead(lead._id, STAGE_BEFORE[lead.stage] || lead.stage)
                                  }
                                  disabled={!STAGE_BEFORE[lead.stage] || movingId === lead._id}
                                  title="Move to previous stage"
                                  className="icon-btn primary"
                                  style={{ width: 28, height: 28 }}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                  </svg>
                                </button>
                                <select
                                  value={lead.stage}
                                  onChange={(e) => moveLead(lead._id, e.target.value)}
                                  disabled={movingId === lead._id}
                                  className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent text-[11px] text-zinc-500 dark:text-zinc-400 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  title="Move to stage"
                                >
                                  {LEAD_STAGES_UI.map((s) => (
                                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() =>
                                    moveLead(lead._id, STAGE_AFTER[lead.stage] || lead.stage)
                                  }
                                  disabled={!STAGE_AFTER[lead.stage] || movingId === lead._id}
                                  title="Move to next stage"
                                  className="icon-btn primary"
                                  style={{ width: 28, height: 28 }}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                </button>
                              </>
                            )}
                            {!canManage && (
                              <Link
                                href={`/leads/${lead._id}`}
                                className="icon-btn primary"
                                style={{ width: 28, height: 28 }}
                                title="View lead"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LeadFormModal
        open={modalOpen}
        lead={editingLead}
        users={users}
        onClose={() => setModalOpen(false)}
        onSaved={fetchBoard}
      />
    </PageShell>
  );
}

const STAGE_BEFORE: Record<string, string | undefined> = {
  qualified: "lead",
  proposal: "qualified",
  negotiation: "proposal",
  won: "negotiation",
  lost: "negotiation",
};

const STAGE_AFTER: Record<string, string | undefined> = {
  lead: "qualified",
  qualified: "proposal",
  proposal: "negotiation",
  negotiation: "won",
  won: "lost",
};
