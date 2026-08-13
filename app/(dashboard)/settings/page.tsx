"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { PageShell, PageHeader, LoadingCenter } from "@/components/portal";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

interface Company {
  _id: string;
  name: string;
  legalName?: string;
  businessType?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  logo?: string;
  timezone?: string;
  currency?: string;
  isActive?: boolean;
}

const emptyCompany: Company = {
  _id: "", name: "", legalName: "", businessType: "", gstNumber: "",
  address: "", city: "", state: "", country: "", contactEmail: "",
  contactPhone: "", logo: "", timezone: "Asia/Kolkata", currency: "INR", isActive: true,
};

export default function SettingsPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [company, setCompany] = useState<Company>(emptyCompany);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyMsg, setCompanyMsg] = useState("");
  const [companyError, setCompanyError] = useState("");

  const [form, setForm] = useState({
    workingHours: { start: "09:00", end: "18:00" },
    workingDays: [] as string[],
    leavePolicy: { annualLeaves: 20, sickLeaves: 10, carryForward: false },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
    if (authStatus === "authenticated" && role !== "ceo") redirect("/");
  }, [authStatus, role]);

  useEffect(() => {
    if (role !== "ceo") return;
    Promise.all([
      fetch("/api/company/profile").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([companyData, settingsData]) => {
        if (companyData.company) setCompany({ ...emptyCompany, ...companyData.company });
        if (settingsData.settings) {
          setForm({
            workingHours: settingsData.settings.workingHours || { start: "09:00", end: "18:00" },
            workingDays: settingsData.settings.workingDays || [],
            leavePolicy: settingsData.settings.leavePolicy || { annualLeaves: 20, sickLeaves: 10, carryForward: false },
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role]);

  const toggleDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }));
  };

  const handleCompanySave = async () => {
    setCompanySaving(true);
    setCompanyMsg("");
    setCompanyError("");
    try {
      const res = await fetch("/api/company/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      const d = await res.json();
      if (res.ok) {
        setCompany({ ...emptyCompany, ...d.company });
        setCompanyMsg("Company profile saved successfully");
        setTimeout(() => setCompanyMsg(""), 3000);
      } else {
        setCompanyError(d.error || "Failed to save company profile");
      }
    } catch {
      setCompanyError("Failed to save company profile");
    } finally {
      setCompanySaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMsg("Settings saved successfully");
        setTimeout(() => setMsg(""), 3000);
      } else {
        const d = await res.json();
        setMsg(d.error || "Failed to save");
      }
    } catch {
      setMsg("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const setCompanyField = (field: keyof Company, value: string | boolean) =>
    setCompany((prev) => ({ ...prev, [field]: value }));

  if (authStatus === "loading" || loading) return <LoadingCenter />;

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        description="Configure company profile and company-wide policies"
        badge={
          company.name ? (
            <span className="count-chip">{company.name}</span>
          ) : undefined
        }
      />

      <div className="settings-layout">
        {/* Company Profile */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Company Profile</h2>
              <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "4px 0 0" }}>Legal and contact details</p>
            </div>
          </div>

          <div className="card-body">
            {companyMsg && (
              <div className="alert alert-success" style={{ marginBottom: 16 }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{companyMsg}</span>
              </div>
            )}
            {companyError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                <span>{companyError}</span>
              </div>
            )}

            <div className="settings-form-grid">
              <Field label="Company Name" required>
                <input type="text" value={company.name} onChange={(e) => setCompanyField("name", e.target.value)} className="input" placeholder="Acme Pvt. Ltd." />
              </Field>
              <Field label="Legal Name">
                <input type="text" value={company.legalName || ""} onChange={(e) => setCompanyField("legalName", e.target.value)} className="input" placeholder="Acme Pvt. Ltd." />
              </Field>
              <Field label="Business Type">
                <input type="text" value={company.businessType || ""} onChange={(e) => setCompanyField("businessType", e.target.value)} className="input" placeholder="e.g. IT Services" />
              </Field>
              <Field label="GST Number">
                <input type="text" value={company.gstNumber || ""} onChange={(e) => setCompanyField("gstNumber", e.target.value)} className="input" placeholder="e.g. 27AAPFU0939F1ZV" />
              </Field>
              <Field label="Address" className="full-width">
                <input type="text" value={company.address || ""} onChange={(e) => setCompanyField("address", e.target.value)} className="input" placeholder="Street address" />
              </Field>
              <Field label="City">
                <input type="text" value={company.city || ""} onChange={(e) => setCompanyField("city", e.target.value)} className="input" placeholder="City" />
              </Field>
              <Field label="State">
                <input type="text" value={company.state || ""} onChange={(e) => setCompanyField("state", e.target.value)} className="input" placeholder="State" />
              </Field>
              <Field label="Country">
                <input type="text" value={company.country || ""} onChange={(e) => setCompanyField("country", e.target.value)} className="input" placeholder="Country" />
              </Field>
              <Field label="Contact Email">
                <input type="email" value={company.contactEmail || ""} onChange={(e) => setCompanyField("contactEmail", e.target.value)} className="input" placeholder="contact@company.com" />
              </Field>
              <Field label="Contact Phone">
                <input type="text" value={company.contactPhone || ""} onChange={(e) => setCompanyField("contactPhone", e.target.value)} className="input" placeholder="+91 98765 43210" />
              </Field>
              <Field label="Logo URL">
                <input type="text" value={company.logo || ""} onChange={(e) => setCompanyField("logo", e.target.value)} className="input" placeholder="https://..." />
              </Field>
              <Field label="Timezone">
                <select value={company.timezone || "Asia/Kolkata"} onChange={(e) => setCompanyField("timezone", e.target.value)} className="input">
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="UTC">UTC</option>
                </select>
              </Field>
              <Field label="Currency">
                <select value={company.currency || "INR"} onChange={(e) => setCompanyField("currency", e.target.value)} className="input">
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="SGD">SGD — Singapore Dollar</option>
                </select>
              </Field>
              <label className="full-width" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={!!company.isActive}
                  onChange={(e) => setCompanyField("isActive", e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>Company is active</span>
              </label>
            </div>

            <div className="settings-save-bar" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <button onClick={handleCompanySave} disabled={companySaving} className="btn btn-primary">
                {companySaving ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Saving...</>
                ) : "Save Company Profile"}
              </button>
            </div>
          </div>
        </div>

        {/* Working Hours */}
        <div className="card">
          <div className="card-header">
            <h2>Working Hours</h2>
          </div>
          <div className="card-body">
            <div className="settings-form-grid">
              <Field label="Start Time">
                <input
                  type="time"
                  value={form.workingHours.start}
                  onChange={(e) => setForm({ ...form, workingHours: { ...form.workingHours, start: e.target.value } })}
                  className="input"
                />
              </Field>
              <Field label="End Time">
                <input
                  type="time"
                  value={form.workingHours.end}
                  onChange={(e) => setForm({ ...form, workingHours: { ...form.workingHours, end: e.target.value } })}
                  className="input"
                />
              </Field>
            </div>

            <div style={{ marginTop: 20 }}>
              <p className="modal-section-title" style={{ marginTop: 0 }}>Working Days</p>
              <div className="settings-day-chips">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`filter-chip${form.workingDays.includes(day) ? " active" : ""}`}
                  >
                    {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Leave Policy */}
        <div className="card">
          <div className="card-header">
            <h2>Leave Policy</h2>
          </div>
          <div className="card-body">
            <div className="settings-form-grid">
              <Field label="Annual Leave Days">
                <input
                  type="number"
                  min={0}
                  value={form.leavePolicy.annualLeaves}
                  onChange={(e) => setForm({ ...form, leavePolicy: { ...form.leavePolicy, annualLeaves: parseInt(e.target.value) || 0 } })}
                  className="input"
                />
              </Field>
              <Field label="Sick Leave Days">
                <input
                  type="number"
                  min={0}
                  value={form.leavePolicy.sickLeaves}
                  onChange={(e) => setForm({ ...form, leavePolicy: { ...form.leavePolicy, sickLeaves: parseInt(e.target.value) || 0 } })}
                  className="input"
                />
              </Field>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 16 }}>
              <input
                type="checkbox"
                checked={form.leavePolicy.carryForward}
                onChange={(e) => setForm({ ...form, leavePolicy: { ...form.leavePolicy, carryForward: e.target.checked } })}
                style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
              />
              <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Allow carry forward of unused leave days</span>
            </label>
          </div>
        </div>

        {msg && (
          <div className={`alert ${msg.includes("successfully") ? "alert-success" : "alert-error"}`}>
            <span>{msg}</span>
          </div>
        )}

        <div className="settings-save-bar">
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? (
              <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Saving...</>
            ) : "Save Settings"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}

function Field({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: "var(--accent-rose)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}
