import { NotificationType } from "@/models/Notification";
import { notifyPermission, notifyUsers } from "./notify";

type ActivityRule = {
  permission: string;
  type: NotificationType;
  link: string;
  title: string;
};

/** Maps audit-trail actions to in-app notification broadcasts. */
const ACTIVITY_RULES: Record<string, ActivityRule> = {
  // Users
  CREATE_USER: { permission: "users.read", type: "system", link: "/users", title: "New team member" },
  UPDATE_USER: { permission: "users.read", type: "system", link: "/users", title: "Team member updated" },
  DELETE_USER: { permission: "users.read", type: "system", link: "/users", title: "Team member removed" },

  // Departments
  CREATE_DEPARTMENT: { permission: "departments.read", type: "system", link: "/departments", title: "Department created" },
  UPDATE_DEPARTMENT: { permission: "departments.read", type: "system", link: "/departments", title: "Department updated" },
  DELETE_DEPARTMENT: { permission: "departments.read", type: "system", link: "/departments", title: "Department removed" },

  // Roles
  CREATE_ROLE: { permission: "roles.read", type: "system", link: "/roles", title: "Role created" },
  UPDATE_ROLE: { permission: "roles.read", type: "system", link: "/roles", title: "Role updated" },
  DELETE_ROLE: { permission: "roles.read", type: "system", link: "/roles", title: "Role removed" },

  // Attendance
  CHECK_IN: { permission: "attendance.manage", type: "system", link: "/attendance", title: "Check-in recorded" },
  CHECK_OUT: { permission: "attendance.manage", type: "system", link: "/attendance", title: "Check-out recorded" },
  UPDATE_ATTENDANCE: { permission: "attendance.manage", type: "system", link: "/attendance", title: "Attendance updated" },
  DELETE_ATTENDANCE: { permission: "attendance.manage", type: "system", link: "/attendance", title: "Attendance removed" },

  // Leaves
  APPLY_LEAVE: { permission: "leaves.approve", type: "leave", link: "/leaves", title: "New leave request" },
  EDIT_LEAVE: { permission: "leaves.approve", type: "leave", link: "/leaves", title: "Leave request updated" },
  DELETE_LEAVE: { permission: "leaves.approve", type: "leave", link: "/leaves", title: "Leave request cancelled" },

  // Projects
  CREATE_PROJECT: { permission: "projects.read", type: "task", link: "/projects", title: "New project" },
  UPDATE_PROJECT: { permission: "projects.read", type: "task", link: "/projects", title: "Project updated" },
  DELETE_PROJECT: { permission: "projects.read", type: "task", link: "/projects", title: "Project removed" },
  ADD_TEAM_MEMBER: { permission: "projects.read", type: "task", link: "/projects", title: "Project team updated" },
  REMOVE_TEAM_MEMBER: { permission: "projects.read", type: "task", link: "/projects", title: "Project team updated" },
  CREATE_MILESTONE: { permission: "projects.read", type: "task", link: "/projects", title: "Milestone added" },
  UPDATE_MILESTONE: { permission: "projects.read", type: "task", link: "/projects", title: "Milestone updated" },
  DELETE_MILESTONE: { permission: "projects.read", type: "task", link: "/projects", title: "Milestone removed" },
  UPDATE_PROJECT_PROGRESS: { permission: "projects.read", type: "task", link: "/projects", title: "Project progress updated" },

  // Tasks
  TASK_DELETED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Task deleted" },
  TASK_ATTACHMENT: { permission: "tasks.read", type: "task", link: "/tasks", title: "Task attachment added" },
  TASK_ATTACHMENT_DELETED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Task attachment removed" },
  TASK_COMMENT_DELETED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Task comment removed" },
  TIME_LOG_CREATED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Time logged" },
  TIME_LOG_UPDATED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Time log updated" },
  TIME_LOG_DELETED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Time log removed" },
  TIMER_STARTED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Task timer started" },
  TIMER_STOPPED: { permission: "tasks.read", type: "task", link: "/tasks", title: "Task timer stopped" },

  // Clients
  CREATE_CLIENT: { permission: "clients.read", type: "system", link: "/clients", title: "New client" },
  UPDATE_CLIENT: { permission: "clients.read", type: "system", link: "/clients", title: "Client updated" },
  DELETE_CLIENT: { permission: "clients.read", type: "system", link: "/clients", title: "Client removed" },

  // CRM & reminders
  CREATE_LEAD: { permission: "crm.read", type: "system", link: "/crm", title: "New lead" },
  UPDATE_LEAD: { permission: "crm.read", type: "system", link: "/crm", title: "Lead updated" },
  DELETE_LEAD: { permission: "crm.read", type: "system", link: "/crm", title: "Lead removed" },
  CONVERT_LEAD: { permission: "crm.read", type: "system", link: "/crm", title: "Lead converted" },
  MOVE_LEAD_STAGE: { permission: "crm.read", type: "system", link: "/crm", title: "Lead stage changed" },
  CREATE_OPPORTUNITY: { permission: "crm.read", type: "system", link: "/crm", title: "New opportunity" },
  UPDATE_OPPORTUNITY: { permission: "crm.read", type: "system", link: "/crm", title: "Opportunity updated" },
  DELETE_OPPORTUNITY: { permission: "crm.read", type: "system", link: "/crm", title: "Opportunity removed" },
  ADD_OPPORTUNITY_NOTE: { permission: "crm.read", type: "system", link: "/crm", title: "Opportunity note added" },
  CREATE_FOLLOWUP: { permission: "crm.read", type: "system", link: "/reminders", title: "New reminder" },
  UPDATE_FOLLOWUP: { permission: "crm.read", type: "system", link: "/reminders", title: "Reminder updated" },
  DELETE_FOLLOWUP: { permission: "crm.read", type: "system", link: "/reminders", title: "Reminder removed" },

  // Finance
  CREATE_EXPENSE: { permission: "finance.read", type: "expense", link: "/expenses", title: "New expense" },
  UPDATE_EXPENSE: { permission: "finance.read", type: "expense", link: "/expenses", title: "Expense updated" },
  DELETE_EXPENSE: { permission: "finance.read", type: "expense", link: "/expenses", title: "Expense removed" },
  CREATE_INVOICE: { permission: "invoices.read", type: "invoice", link: "/invoices", title: "New invoice" },
  UPDATE_INVOICE: { permission: "invoices.read", type: "invoice", link: "/invoices", title: "Invoice updated" },
  DELETE_INVOICE: { permission: "invoices.read", type: "invoice", link: "/invoices", title: "Invoice removed" },
  RECORD_PAYMENT: { permission: "invoices.read", type: "invoice", link: "/invoices", title: "Payment recorded" },
  DELETE_PAYMENT: { permission: "invoices.read", type: "invoice", link: "/invoices", title: "Payment removed" },

  // Payroll
  CREATE_PAYROLL: { permission: "payroll.read", type: "payroll", link: "/payroll", title: "Payroll record created" },
  DELETE_PAYROLL: { permission: "payroll.read", type: "payroll", link: "/payroll", title: "Payroll record removed" },

  // Documents
  UPLOAD_DOCUMENT: { permission: "documents.read", type: "document", link: "/documents", title: "Document uploaded" },
  DELETE_DOCUMENT: { permission: "documents.read", type: "document", link: "/documents", title: "Document removed" },

  // Company / settings
  COMPANY_UPDATED: { permission: "company.read", type: "system", link: "/settings", title: "Company profile updated" },
  SETTINGS_UPDATED: { permission: "company.read", type: "system", link: "/settings", title: "Settings updated" },

  // Approvals
  WITHDRAW_APPROVAL: { permission: "approvals.read", type: "approval", link: "/approvals", title: "Approval withdrawn" },
};

/** Self-actions where the actor should not receive their own notification. */
const EXCLUDE_ACTOR_ACTIONS = new Set([
  "CHECK_IN",
  "CHECK_OUT",
  "TIMER_STARTED",
  "TIMER_STOPPED",
  "MESSAGE_SENT",
  "NOTIFICATION_READ",
  "NOTIFICATIONS_READ_ALL",
  "NOTIFICATION_DELETED",
]);

/** Targeted notifications are sent elsewhere for these actions. */
const SKIP_ACTIONS = new Set([
  "CREATE_APPROVAL",
  "APPROVE_APPROVAL",
  "REJECT_APPROVAL",
  "APPROVE_LEAVE",
  "REJECT_LEAVE",
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_COMMENTED",
  "MESSAGE_SENT",
  "GENERATE_PAYROLL",
  "UPDATE_PAYROLL",
  "NOTIFICATION_READ",
  "NOTIFICATIONS_READ_ALL",
  "NOTIFICATION_DELETED",
  "NOTIFICATION_SENT",
]);

/**
 * Broadcast an in-app notification for a logged activity. Called automatically
 * from logActivity so every module stays in sync without per-route wiring.
 */
export async function notifyForActivity(
  action: string,
  companyId: string,
  actorUserId: string,
  details: string,
  notifyUserIds?: string[]
) {
  if (SKIP_ACTIONS.has(action)) return;

  const rule = ACTIVITY_RULES[action];
  const payload = rule
    ? {
        title: rule.title,
        message: details,
        type: rule.type,
        link: rule.link,
      }
    : {
        title: "Portal update",
        message: details,
        type: "system" as NotificationType,
        link: "/logs",
      };

  if (rule) {
    await notifyPermission(
      companyId,
      rule.permission,
      payload,
      EXCLUDE_ACTOR_ACTIONS.has(action) ? actorUserId : undefined
    );
  } else {
    await notifyPermission(
      companyId,
      "logs.read",
      payload,
      EXCLUDE_ACTOR_ACTIONS.has(action) ? actorUserId : undefined
    );
  }

  if (notifyUserIds?.length) {
    const targets = notifyUserIds.filter((id) => id !== actorUserId);
    if (targets.length > 0) {
      await notifyUsers(
        targets.map((userId) => ({
          companyId,
          userId,
          ...payload,
        }))
      );
    }
  }
}
