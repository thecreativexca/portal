"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter, FilterBar } from "@/components/portal";

const MAX_SIZE = 10 * 1024 * 1024;
const RELATED_ENTITY_TYPES = ["project", "task", "client", "lead", "invoice", "expense"] as const;

interface DocumentRecord {
  _id: string;
  folder: string;
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  uploadedBy: { _id: string; name: string; email: string };
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const myId = (session?.user as any)?.id;

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<DocumentRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") redirect("/login");
  }, [status]);

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFolder) params.set("folder", selectedFolder);
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/documents?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDocuments(data.documents);
      setFolders(data.folders || []);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedFolder, search, page]);

  useEffect(() => {
    if (status === "authenticated") fetchDocuments();
  }, [fetchDocuments, status]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_SIZE) {
      setFormError("File is too large (max 10 MB)");
      setFile(null);
      return;
    }
    setFormError("");
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) { setFormError("Choose a file to upload"); return; }
    setUploading(true);
    setFormError("");
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] || "";
      const folder = newFolder.trim() || "General";

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder, name: file.name, mimeType: file.type || "", size: file.size, data: base64,
          relatedEntityType: entityType || undefined, relatedEntityId: entityId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload");
      }
      setShowUpload(false);
      setFile(null);
      setNewFolder("");
      setEntityType("");
      setEntityId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFolder(folder === "General" ? null : folder);
      fetchDocuments();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: DocumentRecord) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    try {
      const res = await fetch(`/api/documents/${doc._id}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json(); alert(data.error || "Failed to delete"); return; }
      fetchDocuments();
    } catch (err) { console.error("Error deleting document:", err); }
  };

  const handlePreview = async (doc: DocumentRecord) => {
    setPreview(doc);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc._id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      if (data.document?.data) {
        setPreviewUrl(`data:${doc.mimeType || "application/octet-stream"};base64,${data.document.data}`);
      }
    } catch (err) { console.error("Error previewing document:", err); }
    finally { setPreviewLoading(false); }
  };

  if (status === "loading") return <LoadingCenter />;

  return (
    <PageShell>
      <PageHeader
        title="Document Library"
        description="Upload, organize, and share company documents"
        badge={<span className="count-chip">{documents.length} files</span>}
        actions={
          <button onClick={() => { setShowUpload(true); setFormError(""); }} className="btn btn-primary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Upload
          </button>
        }
      />

      <FilterBar>
        <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
          <svg className="search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search documents..."
            className="input"
          />
        </div>
      </FilterBar>

      {/* Folder pills â€” mobile friendly horizontal scroll */}
      <div className="folder-pills">
        <button
          onClick={() => { setSelectedFolder(null); setPage(1); }}
          className={`folder-pill${selectedFolder === null ? " active" : ""}`}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          All Files
        </button>
        {folders.map((f) => (
          <button
            key={f}
            onClick={() => { setSelectedFolder(f); setPage(1); }}
            className={`folder-pill${selectedFolder === f ? " active" : ""}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="card desktop-user-table">
        <div className="card-header">
          <h2>{selectedFolder ? selectedFolder : "All Documents"}</h2>
          <span className="count-chip">{loading ? "â€”" : documents.length} shown</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Folder</th>
                <th>Uploaded By</th>
                <th>Size</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "48px 20px" }}>
                    <div className="loading-center" style={{ padding: 0 }}><div className="spinner" /><span>Loading...</span></div>
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "48px 20px", color: "var(--fg-subtle)" }}>No documents found</td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <DocTableRow key={doc._id} doc={doc} myId={myId} onPreview={handlePreview} onDelete={handleDelete} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="mobile-user-list space-y-3">
        {loading ? (
          <div className="card">
            <div className="loading-center" style={{ padding: "40px 20px" }}><div className="spinner" /><span>Loading...</span></div>
          </div>
        ) : documents.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No documents</p>
              <p>Upload a file or try a different search.</p>
            </div>
          </div>
        ) : (
          documents.map((doc) => {
            const isOwn = doc.uploadedBy?._id === myId;
            return (
              <div key={doc._id} className="user-card" style={{ alignItems: "flex-start" }}>
                {fileIcon(doc.mimeType, doc.name)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button
                    onClick={() => handlePreview(doc)}
                    style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5, margin: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                  >
                    {doc.name}
                  </button>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span className="badge badge-gray">{doc.folder}</span>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{formatSize(doc.size)}</span>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--fg-muted)", margin: "4px 0 0" }}>{doc.uploadedBy?.name}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <a href={doc.url} className="btn btn-ghost btn-sm">Download</a>
                    <button onClick={() => handlePreview(doc)} className="btn btn-secondary btn-sm">Preview</button>
                    {isOwn && <button onClick={() => handleDelete(doc)} className="btn btn-danger btn-sm">Delete</button>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-ghost" style={{ padding: "8px 16px" }}>Previous</button>
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-ghost" style={{ padding: "8px 16px" }}>Next</button>
        </div>
      )}

      {showUpload && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="icon-btn">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {formError && <div className="alert alert-error" style={{ marginBottom: 16 }}><span>{formError}</span></div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>File</label>
                  <input ref={fileInputRef} type="file" onChange={handleFileChange} className="input" style={{ padding: "8px 12px" }} />
                  {file && <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "6px 0 0" }}>{file.name} Â· {formatSize(file.size)}</p>}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Folder</label>
                  <input type="text" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="General (or type a new folder)" className="input" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Linked to</label>
                    <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="input">
                      <option value="">None</option>
                      {RELATED_ENTITY_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>Record ID</label>
                    <input type="text" value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Optional" className="input" />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowUpload(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleUpload} disabled={uploading} className="btn btn-primary">
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="modal-box" style={{ maxWidth: 720, padding: 0, overflow: "hidden" }}>
            <div className="modal-header">
              <h2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.name}</h2>
              <div style={{ display: "flex", gap: 4 }}>
                <a href={preview.url} className="btn btn-secondary btn-sm">Download</a>
                <button onClick={() => setPreview(null)} className="icon-btn">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ padding: 20, background: "var(--bg)", maxHeight: "70vh", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {previewLoading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : previewUrl ? (
                isPreviewable(preview.mimeType) ? (
                  <img src={previewUrl} alt={preview.name} style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 12 }} />
                ) : preview.mimeType === "application/pdf" ? (
                  <iframe src={previewUrl} style={{ width: "100%", height: "60vh", border: "none", borderRadius: 12 }} title={preview.name} />
                ) : (
                  <div className="empty-state">
                    <p>Preview not available for this file type.</p>
                    <a href={preview.url} className="btn btn-primary" style={{ marginTop: 12 }}>Download file</a>
                  </div>
                )
              ) : (
                <p style={{ color: "var(--fg-subtle)" }}>Failed to load preview.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function DocTableRow({ doc, myId, onPreview, onDelete }: {
  doc: DocumentRecord; myId: string;
  onPreview: (d: DocumentRecord) => void; onDelete: (d: DocumentRecord) => void;
}) {
  const isOwn = doc.uploadedBy?._id === myId;
  return (
    <tr>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {fileIcon(doc.mimeType, doc.name)}
          <div style={{ minWidth: 0 }}>
            <button onClick={() => onPreview(doc)} style={{ fontWeight: 600, color: "var(--fg)", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {doc.name}
            </button>
            {doc.relatedEntityType && <span style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "capitalize" }}>{doc.relatedEntityType}</span>}
          </div>
        </div>
      </td>
      <td><span className="badge badge-gray">{doc.folder}</span></td>
      <td style={{ color: "var(--fg-muted)" }}>{doc.uploadedBy?.name || "â€”"}</td>
      <td style={{ color: "var(--fg-muted)" }}>{formatSize(doc.size)}</td>
      <td style={{ color: "var(--fg-subtle)", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(doc.createdAt).toLocaleDateString()}</td>
      <td>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          <a href={doc.url} title="Download" className="icon-btn">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          </a>
          <button onClick={() => onPreview(doc)} title="Preview" className="icon-btn">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          {isOwn && (
            <button onClick={() => onDelete(doc)} title="Delete" className="icon-btn" style={{ color: "var(--accent-rose)" }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "â€”";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mime?: string): boolean {
  return !!mime && mime.startsWith("image/");
}

function fileIcon(mime?: string, name?: string) {
  const cls = "w-5 h-5";
  const common = { fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor" } as const;
  const wrap = (bg: string, color: string, icon: React.ReactNode) => (
    <div style={{ display: "flex", height: 36, width: 36, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 10, background: bg, color }}>
      {icon}
    </div>
  );

  if (mime === "application/pdf") {
    return wrap("rgba(244,63,94,0.12)", "#f43f5e", <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>);
  }
  if (mime?.startsWith("image/")) {
    return wrap("rgba(56,189,248,0.12)", "#0ea5e9", <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>);
  }
  if (mime?.startsWith("text/") || name?.endsWith(".txt") || name?.endsWith(".md")) {
    return wrap("var(--bg-card2)", "var(--fg-muted)", <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>);
  }
  return wrap("rgba(16,185,129,0.12)", "#10b981", <svg className={cls} {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>);
}
