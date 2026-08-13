/**
 * Permission catalog + default role definitions for the RBAC system.
 *
 * `Permission` documents are seeded per company from PERMISSION_CATALOG.
 * `Role.permissions` is a string[] of permission keys from this catalog.
 * Enforcement lives in lib/guards.ts (requirePermission) which checks a
 * user's role document. The CEO role is always granted full access.
 */

export interface PermissionDef {
  key: string;
  name: string;
  module: string;
  description: string;
}

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // Company
  { key: "company.read", name: "View Company", module: "company", description: "View company profile" },
  { key: "company.write", name: "Edit Company", module: "company", description: "Update company profile" },
  // Users
  { key: "users.read", name: "View Users", module: "users", description: "View employee records" },
  { key: "users.write", name: "Manage Users", module: "users", description: "Create, edit, and delete employees" },
  // Departments
  { key: "departments.read", name: "View Departments", module: "departments", description: "View departments" },
  { key: "departments.write", name: "Manage Departments", module: "departments", description: "Create, edit, and delete departments" },
  // Roles
  { key: "roles.read", name: "View Roles", module: "roles", description: "View roles and their permissions" },
  { key: "roles.write", name: "Manage Roles", module: "roles", description: "Create, edit, and assign role permissions" },
  // Attendance
  { key: "attendance.read", name: "View Attendance", module: "attendance", description: "View attendance records" },
  { key: "attendance.manage", name: "Manage Attendance", module: "attendance", description: "Approve / override attendance" },
  // Leaves
  { key: "leaves.read", name: "View Leaves", module: "leaves", description: "View leave requests" },
  { key: "leaves.approve", name: "Approve Leaves", module: "leaves", description: "Approve or reject leave requests" },
  // Projects
  { key: "projects.read", name: "View Projects", module: "projects", description: "View projects" },
  { key: "projects.write", name: "Manage Projects", module: "projects", description: "Create, edit, and delete projects" },
  // Clients
  { key: "clients.read", name: "View Clients", module: "clients", description: "View clients and their contracts" },
  { key: "clients.write", name: "Manage Clients", module: "clients", description: "Create, edit, and delete clients" },
  // CRM
  { key: "crm.read", name: "View CRM", module: "crm", description: "View the sales pipeline, leads, opportunities, and follow-ups" },
  { key: "crm.write", name: "Manage CRM", module: "crm", description: "Create, edit, and move leads and opportunities, and schedule follow-ups" },
  // Invoices
  { key: "invoices.read", name: "View Invoices", module: "invoices", description: "View client invoices and payments" },
  { key: "invoices.write", name: "Manage Invoices", module: "invoices", description: "Create invoices and record payments" },
  // Expenses
  { key: "expenses.read", name: "View Expenses", module: "expenses", description: "View company expenses" },
  { key: "expenses.write", name: "Manage Expenses", module: "expenses", description: "Create, edit, and delete expenses" },
  // Payroll
  { key: "payroll.read", name: "View Payroll", module: "payroll", description: "View payroll records and net pay" },
  { key: "payroll.write", name: "Manage Payroll", module: "payroll", description: "Generate and pay payroll" },
  // Finance
  { key: "finance.read", name: "View Finance", module: "finance", description: "View the finance dashboard, revenue, and profit reports" },
  // Tasks
  { key: "tasks.read", name: "View Tasks", module: "tasks", description: "View tasks" },
  { key: "tasks.write", name: "Manage Tasks", module: "tasks", description: "Create, assign, and update tasks" },
  // Reports
  { key: "reports.read", name: "View Reports", module: "reports", description: "View analytics reports" },
  // Logs
  { key: "logs.read", name: "View Activity Logs", module: "logs", description: "View the audit trail" },
  // Notifications
  { key: "notifications.read", name: "View Notifications", module: "notifications", description: "View and manage own notifications" },
  // Approvals
  { key: "approvals.read", name: "View Approvals", module: "approvals", description: "View approval requests" },
  { key: "approvals.approve", name: "Approve Requests", module: "approvals", description: "Approve or reject approval requests" },
  // Documents
  { key: "documents.read", name: "View Documents", module: "documents", description: "View and download documents" },
  { key: "documents.write", name: "Manage Documents", module: "documents", description: "Upload and manage all documents" },
];

/** Default permission set per system role. */
export const ROLE_DEFINITIONS: RoleDef[] = [
  {
    key: "ceo",
    name: "CEO",
    description: "Full access to the entire company workspace",
    permissions: PERMISSION_CATALOG.map((p) => p.key),
    isSystem: true,
  },
  {
    key: "hr",
    name: "HR",
    description: "Manage employees, departments, and leave approvals",
    permissions: [
      "company.read",
      "users.read",
      "users.write",
      "departments.read",
      "departments.write",
      "roles.read",
      "attendance.read",
      "attendance.manage",
      "leaves.read",
      "leaves.approve",
      "clients.read",
      "crm.read",
      "invoices.read",
      "expenses.read",
      "payroll.read",
      "payroll.write",
      "finance.read",
      "reports.read",
      "notifications.read",
      "approvals.read",
      "approvals.approve",
      "documents.read",
      "documents.write",
    ],
    isSystem: true,
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Plan and run projects and tasks across teams",
    permissions: [
      "company.read",
      "users.read",
      "departments.read",
      "attendance.read",
      "leaves.read",
      "projects.read",
      "projects.write",
      "tasks.read",
      "tasks.write",
      "clients.read",
      "clients.write",
      "crm.read",
      "crm.write",
      "invoices.read",
      "invoices.write",
      "expenses.read",
      "reports.read",
      "notifications.read",
      "approvals.read",
      "approvals.approve",
      "documents.read",
      "documents.write",
    ],
    isSystem: true,
  },
  {
    key: "team_lead",
    name: "Team Lead",
    description: "Lead a team and manage its tasks",
    permissions: [
      "company.read",
      "users.read",
      "projects.read",
      "projects.write",
      "tasks.read",
      "tasks.write",
      "clients.read",
      "crm.read",
      "invoices.read",
      "notifications.read",
      "approvals.read",
      "documents.read",
    ],
    isSystem: true,
  },
  {
    key: "employee",
    name: "Employee",
    description: "View own work, mark attendance, and request leaves",
    permissions: [
      "attendance.read",
      "leaves.read",
      "projects.read",
      "tasks.read",
      "notifications.read",
      "approvals.read",
      "documents.read",
    ],
    isSystem: true,
  },
  {
    key: "accounts",
    name: "Accounts",
    description: "Finance and company reporting",
    permissions: [
      "company.read",
      "users.read",
      "clients.read",
      "crm.read",
      "invoices.read",
      "invoices.write",
      "expenses.read",
      "expenses.write",
      "payroll.read",
      "payroll.write",
      "finance.read",
      "reports.read",
      "notifications.read",
      "approvals.read",
      "approvals.approve",
      "documents.read",
      "documents.write",
    ],
    isSystem: true,
  },
];

export const ROLE_NAMES: Record<string, string> = Object.fromEntries(
  ROLE_DEFINITIONS.map((r) => [r.key, r.name])
);

export function roleName(key: string): string {
  return ROLE_NAMES[key] || key;
}

export function permissionsForRole(key: string): string[] {
  const role = ROLE_DEFINITIONS.find((r) => r.key === key);
  return role ? role.permissions : [];
}
