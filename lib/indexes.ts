/**
 * Central MongoDB index registry.
 *
 * Single source of truth for production indexes. Every entry is a
 * companyId-prefixed compound index matching the query patterns in the API
 * layer (list filters, sort orders, date-range scans, soft-delete filters).
 * Global/schema-level indexes are intentionally NOT repeated here unless they
 * need a company-scoped variant.
 *
 * Create/verify with:  node -r ts-node/register scripts/create-indexes.ts
 */

export interface IndexSpec {
  key: Record<string, 1 | -1>;
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

export const INDEX_REGISTRY: Record<string, IndexSpec[]> = {
  activitylogs: [
    { key: { companyId: 1, timestamp: -1 } },
    { key: { companyId: 1, userId: 1, timestamp: -1 } },
    { key: { companyId: 1, taskId: 1, timestamp: -1 } },
    { key: { companyId: 1, action: 1 } },
  ],
  approvals: [
    { key: { companyId: 1, status: 1, createdAt: -1 } },
    { key: { companyId: 1, type: 1, status: 1, createdAt: -1 } },
    { key: { companyId: 1, requestedBy: 1, createdAt: -1 } },
  ],
  attendances: [
    { key: { companyId: 1, date: 1 } },
    { key: { companyId: 1, userId: 1, date: -1 } },
  ],
  clients: [
    { key: { companyId: 1, deletedAt: 1, status: 1 } },
    { key: { companyId: 1, deletedAt: 1, accountManagerId: 1 } },
    { key: { companyId: 1, deletedAt: 1, createdAt: -1 } },
  ],
  companies: [{ key: { isActive: 1 } }],
  departments: [{ key: { companyId: 1, isActive: 1 } }],
  documents: [
    { key: { companyId: 1, folder: 1, createdAt: -1 } },
    { key: { companyId: 1, uploadedBy: 1, createdAt: -1 } },
    { key: { companyId: 1, relatedEntityType: 1, relatedEntityId: 1, createdAt: -1 } },
  ],
  expenses: [
    { key: { companyId: 1, date: -1, createdAt: -1 } },
    { key: { companyId: 1, category: 1, date: -1 } },
    { key: { companyId: 1, projectId: 1 } },
  ],
  followups: [
    { key: { companyId: 1, deletedAt: 1, dueAt: 1 } },
    { key: { companyId: 1, deletedAt: 1, status: 1, dueAt: 1 } },
    { key: { companyId: 1, deletedAt: 1, assignedToId: 1, dueAt: 1 } },
    { key: { companyId: 1, leadId: 1, deletedAt: 1 } },
    { key: { companyId: 1, opportunityId: 1, deletedAt: 1 } },
  ],
  invoices: [
    { key: { companyId: 1, status: 1, dueDate: 1 } },
    { key: { companyId: 1, issueDate: -1 } },
    { key: { companyId: 1, clientId: 1, issueDate: -1 } },
  ],
  leads: [
    { key: { companyId: 1, deletedAt: 1, createdAt: -1 } },
    { key: { companyId: 1, deletedAt: 1, ownerId: 1 } },
    { key: { companyId: 1, deletedAt: 1, source: 1 } },
    { key: { companyId: 1, stage: 1, stageChangedAt: -1 } },
  ],
  leaves: [
    { key: { companyId: 1, status: 1, createdAt: -1 } },
    { key: { companyId: 1, userId: 1, createdAt: -1 } },
    { key: { companyId: 1, status: 1, startDate: 1, endDate: 1 } },
    { key: { companyId: 1, startDate: 1 } },
  ],
  messages: [
    { key: { companyId: 1, createdAt: -1 } },
    { key: { companyId: 1, senderId: 1, receiverId: 1, createdAt: 1 } },
    { key: { companyId: 1, receiverId: 1, read: 1 } },
  ],
  milestones: [
    { key: { companyId: 1, projectId: 1, dueDate: 1 } },
    { key: { companyId: 1, projectId: 1, status: 1 } },
    { key: { companyId: 1, status: 1 } },
  ],
  notifications: [
    { key: { companyId: 1, userId: 1, createdAt: -1 } },
    { key: { companyId: 1, userId: 1, isRead: 1 } },
  ],
  opportunities: [
    { key: { companyId: 1, deletedAt: 1, createdAt: -1 } },
    { key: { companyId: 1, deletedAt: 1, ownerId: 1 } },
    { key: { companyId: 1, deletedAt: 1, expectedCloseDate: 1 } },
    { key: { companyId: 1, deletedAt: 1, "proposal.status": 1 } },
  ],
  payments: [
    { key: { companyId: 1, paymentDate: -1 } },
    { key: { companyId: 1, invoiceId: 1, paymentDate: -1 } },
    { key: { invoiceId: 1, paymentDate: -1 } },
  ],
  payrolls: [
    { key: { companyId: 1, month: 1, paymentStatus: 1 } },
    { key: { companyId: 1, userId: 1, month: -1 } },
  ],
  permissions: [{ key: { companyId: 1, module: 1, key: 1 } }],
  projects: [
    { key: { companyId: 1, status: 1 } },
    { key: { companyId: 1, priority: 1 } },
    { key: { companyId: 1, teamMemberIds: 1 } },
    { key: { companyId: 1, clientId: 1 } },
    { key: { companyId: 1, projectManagerId: 1 } },
    { key: { companyId: 1, status: 1, endDate: 1 } },
    { key: { companyId: 1, createdAt: -1 } },
  ],
  roles: [{ key: { companyId: 1, name: 1 } }],
  settings: [{ key: { companyId: 1 }, unique: true }],
  tasks: [
    { key: { companyId: 1, projectId: 1, status: 1 } },
    { key: { companyId: 1, assignedTo: 1, status: 1, dueDate: 1 } },
    { key: { companyId: 1, assignedTo: 1, dueDate: -1 } },
    { key: { companyId: 1, status: 1, dueDate: 1 } },
    { key: { companyId: 1, priority: 1, createdAt: -1 } },
  ],
  timelogs: [
    { key: { companyId: 1, userId: 1, startTime: -1 } },
    { key: { companyId: 1, taskId: 1, startTime: -1 } },
    { key: { companyId: 1, startTime: 1 } },
    { key: { taskId: 1, endTime: 1 } },
  ],
  users: [
    { key: { companyId: 1, role: 1, status: 1 } },
    { key: { companyId: 1, departmentId: 1, status: 1 } },
    { key: { companyId: 1, status: 1, createdAt: -1 } },
  ],
};
