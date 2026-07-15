// Domain types mirrored from the real backend row-mapping functions
// (src/db/*Store.js's mapRowTo*()) -- NOT re-derived from guesswork.
// Kept in one file since the backend has no shared type-generation step
// (plain JSDoc CommonJS, no OpenAPI spec) -- if a store's mapping
// function changes shape, this file must be updated by hand to match.

export type RoleName = "platform_admin" | "technician" | "org_owner" | "org_member" | "read_only_customer";

// ---- F001 Organization ----
export interface Organization {
  id: string;
  name: string;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  version: number;
}

// ---- F002 Invitation ----
export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: RoleName;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  resendCount: number;
  lastSentAt?: string;
}

// ---- F016 Approval ----
export interface Approval {
  id: string;
  organizationId: string;
  subjectType: "scope_of_work" | "change_order";
  subjectId: string;
  status: "pending" | "approved" | "rejected" | "expired";
  requestedAt: string;
  requestedBy: string;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
}

// ---- F019/F023 Ticket ----
export type TicketStatus =
  | "submitted"
  | "triaged"
  | "assigned"
  | "in_progress"
  | "waiting_on_customer"
  | "reopened"
  | "resolved"
  | "closed";

export interface Ticket {
  id: string;
  organizationId: string;
  category: string;
  subject: string;
  description: string;
  status: TicketStatus;
  details?: Record<string, unknown>;
  submittedAt: string;
  submittedBy: string;
  updatedAt: string;
  version: number;
}

// ---- F020/F021/F022 ticket workflow ----
export interface TriageResult {
  ticketId: string;
  queue: string;
  matchedRuleId: string;
  decidedAt: string;
}
export interface PriorityAssessment {
  ticketId: string;
  level: "critical" | "high" | "medium" | "low";
  score: number;
  decidedAt: string;
}
export interface Assignment {
  ticketId: string;
  technicianUserId: string;
  assignedAt: string;
  assignedBy: string;
}

// ---- F026 Scope of Work ----
export interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}
export interface ScopeOfWork {
  id: string;
  organizationId: string;
  ticketId: string;
  version: number;
  status: "draft" | "sent" | "approved" | "rejected" | "superseded";
  assumptions: string[];
  exclusions: string[];
  lineItems: LineItem[];
  createdAt: string;
  createdBy: string;
}

// ---- F027 Change Order ----
export interface ChangeOrder {
  id: string;
  organizationId: string;
  originalScopeId: string;
  description: string;
  addedLineItems: LineItem[];
  createdAt: string;
  createdBy: string;
}

// ---- F028 Payment Request ----
export interface PaymentRequest {
  id: string;
  organizationId: string;
  subjectType: "scope_of_work" | "change_order" | "subscription";
  subjectId: string;
  amountRef: string;
  status: "pending" | "paid" | "failed" | "refunded";
  createdAt: string;
  providerReference?: string;
}

// ---- F010 Service Record ----
export interface ServiceRecord {
  id: string;
  organizationId: string;
  category: "website" | "it" | "security" | "recurring_service";
  title: string;
  status: "active" | "on_hold" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  version: number;
}

// ---- F031 Website Profile ----
export interface WebsiteProfile {
  id: string;
  organizationId: string;
  primaryUrl: string;
  domainRegistrar?: string;
  hostingProvider?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- F049 Entitlement ----
export interface EntitlementLimit {
  planKey: string;
  usageKey: string;
  limit: number;
  resetPeriod: "monthly" | "annual" | "one_time";
}
export interface EntitlementUsageView {
  limit: EntitlementLimit;
  consumed: number;
  remaining: number;
  periodStart: string;
}
export interface RecordUsageResult {
  recorded: boolean;
  withinLimit: boolean;
  remaining: number;
  reason: string;
}

// ---- F052 Subscription ----
export interface Subscription {
  id: string;
  organizationId: string;
  planKey: string;
  status: "active" | "paused" | "cancelled";
  startedAt: string;
  pausedAt?: string;
  cancelledAt?: string;
  providerSubscriptionReference?: string;
}

// ---- F043/F041 Technology Asset / Backup ----
export interface TechnologyAsset {
  id: string;
  organizationId: string;
  type: string;
  label: string;
  warrantyExpiresAt?: string;
  licenseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface BackupRecord {
  id: string;
  organizationId: string;
  websiteProfileId: string;
  category: string;
  location: string;
  createdAt: string;
  restoreVerifiedAt?: string;
}

// ---- F048/F037 Reminder ----
export interface Reminder {
  id: string;
  organizationId: string;
  subjectId: string;
  subjectType: string;
  expiresAt: string;
  sent: boolean;
}

// ---- F044 IT Support classification ----
export interface ItSupportClassification {
  ticketId: string;
  classification: "remote" | "on_site" | "escalate";
  reason: string;
}

// ---- F046/F047 Readiness Checklist (Session 20 customer/staff split) ----
export type ChecklistAudience = "customer" | "staff";
export interface ChecklistItem {
  key: string;
  label: string;
  weight: number;
  audience: ChecklistAudience;
}
export interface ChecklistDefinitionSummary {
  id: string;
  title: string;
}
export interface ChecklistDefinition {
  id: string;
  title: string;
  items: ChecklistItem[];
}
export type ChecklistSubmissionStatus = "draft" | "submitted" | "returned" | "verified";
export interface ChecklistSubmission {
  organizationId: string;
  checklistDefinitionId: string;
  status: ChecklistSubmissionStatus;
  submittedAt?: string;
  submittedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}
export interface ReadinessScore {
  score: number;
  unmetItemKeys: string[];
  summary: string;
}
// getChecklistForCustomer()'s shape -- customer-audience items only, no
// staffNote/staffVerified anywhere (see checklistStore.js's module comment).
export interface CustomerChecklistAnswer {
  itemKey: string;
  met: boolean;
  comment: string | null;
}
export interface CustomerChecklistView {
  definition: { id: string; title: string; items: ChecklistItem[] };
  answers: CustomerChecklistAnswer[];
  submission: { status: ChecklistSubmissionStatus; submittedAt: string | null; reviewedAt: string | null; reviewNote: string | null };
}
// getChecklistForStaff()'s shape -- every item, every field.
export interface StaffChecklistAnswer {
  itemKey: string;
  met: boolean;
  comment?: string;
  staffNote?: string;
  staffVerified: boolean;
}
export interface StaffChecklistView {
  definition: ChecklistDefinition;
  answers: StaffChecklistAnswer[];
  submission: ChecklistSubmission;
  score: ReadinessScore;
}

// ---- F025 Work log ----
export interface TimeEntry {
  id: string;
  ticketId: string;
  technicianUserId: string;
  minutes: number;
  recordedAt: string;
  note?: string;
}

// ---- F017 Activity Timeline ----
export interface ActivityEvent {
  id: string;
  organizationId: string;
  sourceType: string;
  sourceId: string;
  occurredAt: string;
  summary: string;
  customerVisible: boolean;
}

// ---- F051 Work Queue ----
export interface WorkQueueViewModel {
  openTicketsByPriority: Record<"critical" | "high" | "medium" | "low", Ticket[]>;
  totalOpenTickets: number;
  pendingApprovalCount: number;
  paymentsNeedingReconciliation: number;
  openIncidentCount: number;
}

// ---- F054 Metrics ----
export interface MetricsSummary {
  byType: Record<string, number>;
  byDay: Record<string, number>;
}

// ---- F055 Template ----
export interface TemplateDefinition {
  id: string;
  key: string;
  subject: string;
  body: string;
  allowedVariables: string[];
}
export interface RenderedTemplate {
  subject: string;
  body: string;
}

// ---- F057 Webhook Event ----
export interface WebhookEvent {
  id: string;
  provider: string;
  receivedAt: string;
  verified: boolean;
  verificationReason: string;
  eventType: string | null;
}

// ---- F008 Audit Event ----
export interface AuditEvent {
  id: string;
  correlationId: string;
  occurredAt: string;
  actorType: "user" | "automated_service" | "system";
  actorId: string;
  actorRole?: string;
  organizationId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: "success" | "failure" | "denied";
  metadata?: Record<string, unknown>;
}
export interface AuditLogPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

// ---- Auth / session ----
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: "customer" | "staff" | "admin";
  verified: boolean;
}
export interface LoginResult {
  message: string;
  user: AuthenticatedUser;
}
export interface MfaRequiredResult {
  mfaRequired: true;
  enrollmentRequired: boolean;
  message: string;
}
export interface MfaEnrollStartResult {
  secret: string;
  otpauthUri: string;
  message: string;
}
// mfa-enroll.js's "confirm" action returns one of two shapes depending on
// whether a confirmation email could be sent (Session 20 step 8's real
// fix for the enrollment-hijack finding): if delivery succeeds,
// activation is deferred until the emailed link is clicked
// (MfaEnrollPendingConfirmation); only if email couldn't be delivered
// does it fall back to the original immediate-activation shape.
export interface MfaEnrollPendingConfirmation {
  pendingEmailConfirmation: true;
  message: string;
}
export interface MfaEnrollActivatedResult {
  message: string;
  recoveryCodes: string[];
  user: AuthenticatedUser;
}
export type MfaEnrollConfirmResult = MfaEnrollPendingConfirmation | MfaEnrollActivatedResult;
// action: "verify-email" always returns the activated shape -- by the
// time the link is valid and unused, activation always completes.
export type MfaEnrollVerifyEmailResult = MfaEnrollActivatedResult;
