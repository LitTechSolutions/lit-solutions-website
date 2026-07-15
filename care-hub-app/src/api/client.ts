// Typed client for every Care Hub HTTP endpoint (24 resource endpoints
// under netlify/functions/, plus the auth-login/mfa-*/auth-logout login
// flow). One namespace per endpoint file, matching the backend's
// one-file-per-resource convention 1:1 so a reader can always find the
// server-side source for any client call by name. Every method's
// request/response shape is taken directly from the endpoint's own
// route comment and store mapping function (see types.ts's header
// comment) -- not guessed from REST convention.
import { request } from "./http";
import type {
  Approval,
  ActivityEvent,
  Assignment,
  AuditLogPage,
  AuthenticatedUser,
  BackupRecord,
  ChangeOrder,
  ChecklistDefinition,
  ChecklistDefinitionSummary,
  ChecklistSubmission,
  CustomerChecklistView,
  StaffChecklistView,
  EntitlementUsageView,
  Invitation,
  ItSupportClassification,
  LineItem,
  LoginResult,
  MetricsSummary,
  MfaEnrollConfirmResult,
  MfaEnrollStartResult,
  MfaEnrollVerifyEmailResult,
  MfaRequiredResult,
  Organization,
  PaymentRequest,
  PriorityAssessment,
  Reminder,
  RecordUsageResult,
  RenderedTemplate,
  ScopeOfWork,
  ServiceRecord,
  Subscription,
  TechnologyAsset,
  TemplateDefinition,
  Ticket,
  TimeEntry,
  TriageResult,
  WebhookEvent,
  WebsiteProfile,
  WorkQueueViewModel,
} from "./types";

// ---- Auth / MFA (login-flow endpoints, not Care Hub resources) ----
export const auth = {
  login: (email: string, password: string) =>
    request<LoginResult | MfaRequiredResult>("/auth-login", { method: "POST", body: { email, password } }),
  logout: () => request<{ message: string }>("/auth-logout", { method: "POST" }),
  mfaEnrollStart: () => request<MfaEnrollStartResult>("/mfa-enroll", { method: "POST", body: { action: "start" } }),
  mfaEnrollConfirm: (code: string) =>
    request<MfaEnrollConfirmResult>("/mfa-enroll", { method: "POST", body: { action: "confirm", code } }),
  mfaEnrollVerifyEmail: (token: string) =>
    request<MfaEnrollVerifyEmailResult>("/mfa-enroll", { method: "POST", body: { action: "verify-email", token } }),
  mfaVerifyCode: (code: string) => request<LoginResult>("/mfa-verify", { method: "POST", body: { code } }),
  mfaVerifyRecoveryCode: (recoveryCode: string) =>
    request<LoginResult>("/mfa-verify", { method: "POST", body: { recoveryCode } }),
  mfaDisable: (password: string) =>
    request<{ message: string }>("/mfa-manage", { method: "POST", body: { action: "disable", password } }),
  mfaReset: (password: string) =>
    request<{ message: string }>("/mfa-manage", { method: "POST", body: { action: "reset", password } }),
};

// ---- F001 Organizations ----
export const organizations = {
  create: (input: { name: string }) => request<{ organization: Organization }>("/organizations", { method: "POST", body: input }),
  get: (organizationId: string) =>
    request<{ organization: Organization }>("/organizations", { query: { organizationId } }),
  setStatus: (organizationId: string, status: Organization["status"]) =>
    request<{ organization: Organization }>("/organizations", { method: "PATCH", body: { organizationId, status } }),
};

// ---- F051 Work Queue (platform_admin, cross-org) ----
export const workQueue = {
  fetch: () => request<{ workQueue: WorkQueueViewModel }>("/work-queue"),
};

// ---- F016 Approvals ----
export const approvals = {
  list: (organizationId: string) => request<{ approvals: Approval[] }>("/approvals", { query: { organizationId } }),
  decide: (input: {
    approvalId: string;
    organizationId: string;
    subjectType: Approval["subjectType"];
    decisionAction: "approve" | "reject";
    decisionNote?: string;
  }) => request<{ approval: Approval }>("/approvals", { method: "PATCH", body: input }),
};

// ---- F002 Invitations ----
export const invitations = {
  create: (input: { organizationId: string; email: string; role: string }) =>
    request<{ invitation: Invitation }>("/invitations", { method: "POST", body: input }),
  list: (organizationId: string) => request<{ invitations: Invitation[] }>("/invitations", { query: { organizationId } }),
  revoke: (invitationId: string) => request<{ invitation: Invitation }>("/invitations", { method: "PATCH", body: { invitationId, action: "revoke" } }),
  resend: (invitationId: string) => request<{ invitation: Invitation }>("/invitations", { method: "PATCH", body: { invitationId, action: "resend" } }),
  peek: (token: string) => request<{ email: string; role: string; organizationName: string; expiresAt: string }>("/invitation-accept", { query: { token } }),
  accept: (input: { token: string; name: string; password: string; termsAccepted: boolean; marketingConsent: boolean }) =>
    request<{ message: string }>("/invitation-accept", { method: "POST", body: input }),
};

// ---- F019/F023 Tickets ----
export const tickets = {
  create: (input: { organizationId: string; category: string; subject: string; description: string; details?: Record<string, unknown> }) =>
    request<{ ticket: Ticket }>("/tickets", { method: "POST", body: input }),
  list: (organizationId: string) => request<{ tickets: Ticket[] }>("/tickets", { query: { organizationId } }),
  transition: (input: { ticketId: string; organizationId: string; nextStatus: Ticket["status"] }) =>
    request<{ ticket: Ticket }>("/tickets", { method: "PATCH", body: input }),
};

// ---- F020/F021/F022 Ticket workflow (manual re-triage/re-score/re-assign) ----
export const ticketWorkflow = {
  triage: (ticketId: string, rules: unknown[]) =>
    request<{ result: TriageResult }>("/ticket-workflow", { method: "POST", body: { action: "triage", ticketId, rules } }),
  prioritize: (ticketId: string, inputs: { impact: number; urgency: number; safetyConcern: boolean; securityConcern: boolean }) =>
    request<{ assessment: PriorityAssessment }>("/ticket-workflow", { method: "POST", body: { action: "prioritize", ticketId, inputs } }),
  assign: (ticketId: string, organizationId: string, candidates: unknown[]) =>
    request<{ assignment: Assignment }>("/ticket-workflow", { method: "POST", body: { action: "assign", ticketId, organizationId, candidates } }),
};

// ---- F044 IT Support classification ----
export const itSupport = {
  classify: (input: { organizationId: string; ticketId: string; requiresPhysicalAccess: boolean; safetyRisk: boolean }) =>
    request<{ classification: ItSupportClassification }>("/it-support", { method: "POST", body: input }),
};

// ---- F025 Work log ----
export const workLog = {
  recordTime: (ticketId: string, organizationId: string, minutes: number, note?: string) =>
    request<{ entry: TimeEntry }>("/work-log", { method: "POST", body: { kind: "time", ticketId, organizationId, minutes, note } }),
  recordNote: (ticketId: string, organizationId: string, body: string) =>
    request<{ note: unknown }>("/work-log", { method: "POST", body: { kind: "note", ticketId, organizationId, body } }),
  total: (ticketId: string) => request<{ totalMinutes: number }>("/work-log", { query: { ticketId } }),
};

// ---- F017 Activity timeline ----
export const activityTimeline = {
  list: (organizationId: string, limit?: number) =>
    request<{ timeline: ActivityEvent[] }>("/activity-timeline", { query: { organizationId, limit } }),
};

// ---- F026 Scope of Work ----
export const scopeOfWork = {
  create: (input: { organizationId: string; ticketId: string; assumptions: string[]; exclusions: string[]; lineItems: LineItem[] }) =>
    request<{ scope: ScopeOfWork }>("/scope-of-work", { method: "POST", body: input }),
  list: (organizationId: string, ticketId: string) =>
    request<{ scopes: ScopeOfWork[] }>("/scope-of-work", { query: { organizationId, ticketId } }),
  createNextVersion: (input: { scopeId: string; organizationId: string; assumptions: string[]; exclusions: string[]; lineItems: LineItem[] }) =>
    request<{ scope: ScopeOfWork }>("/scope-of-work", { method: "PATCH", body: input }),
};

// ---- F027 Change Orders ----
export const changeOrders = {
  create: (input: { organizationId: string; originalScopeId: string; description: string; addedLineItems: LineItem[] }) =>
    request<{ changeOrder: ChangeOrder }>("/change-orders", { method: "POST", body: input }),
  get: (organizationId: string, changeOrderId: string) =>
    request<{ changeOrder: ChangeOrder }>("/change-orders", { query: { organizationId, changeOrderId } }),
  list: (organizationId: string) => request<{ changeOrders: ChangeOrder[] }>("/change-orders", { query: { organizationId } }),
};

// ---- F028 Payment Requests ----
export const paymentRequests = {
  create: (input: {
    organizationId: string;
    subjectType: PaymentRequest["subjectType"];
    subjectId: string;
    amountRefPrefix: string;
    totalAmount: number;
    isThirdPartyExpense?: boolean;
  }) => request<{ paymentRequests: PaymentRequest[] }>("/payment-requests", { method: "POST", body: input }),
  transition: (input: { paymentRequestId: string; nextStatus: PaymentRequest["status"]; providerReference?: string }) =>
    request<{ paymentRequest: PaymentRequest }>("/payment-requests", { method: "PATCH", body: input }),
};

// ---- F010 Service Records ----
export const serviceRecords = {
  create: (input: { organizationId: string; category: ServiceRecord["category"]; title: string }) =>
    request<{ record: ServiceRecord }>("/service-records", { method: "POST", body: input }),
  list: (organizationId: string) => request<{ records: ServiceRecord[] }>("/service-records", { query: { organizationId } }),
  setStatus: (recordId: string, status: ServiceRecord["status"]) =>
    request<{ record: ServiceRecord }>("/service-records", { method: "PATCH", body: { recordId, status } }),
};

// ---- F031 Website Profiles ----
export const websiteProfiles = {
  create: (input: { organizationId: string; primaryUrl: string; domainRegistrar?: string; hostingProvider?: string }) =>
    request<{ profile: WebsiteProfile }>("/website-profiles", { method: "POST", body: input }),
  list: (organizationId: string) => request<{ profiles: WebsiteProfile[] }>("/website-profiles", { query: { organizationId } }),
};

// ---- F049 Entitlements ----
export const entitlements = {
  recordUsage: (organizationId: string, planKey: string, usageKey: string, amount: number) =>
    request<RecordUsageResult>("/entitlements", { method: "POST", body: { organizationId, planKey, usageKey, amount } }),
  view: (organizationId: string, planKey: string, usageKey: string) =>
    request<EntitlementUsageView>("/entitlements", { query: { organizationId, planKey, usageKey } }),
};

// ---- F052 Subscriptions ----
export const subscriptions = {
  create: (organizationId: string, planKey: string) =>
    request<{ subscription: Subscription }>("/subscriptions", { method: "POST", body: { organizationId, planKey } }),
  list: (organizationId: string) => request<{ subscriptions: Subscription[] }>("/subscriptions", { query: { organizationId } }),
  transition: (subscriptionId: string, nextStatus: Subscription["status"]) =>
    request<{ subscription: Subscription }>("/subscriptions", { method: "PATCH", body: { subscriptionId, nextStatus } }),
};

// ---- F043/F041 Technology Assets / Backups ----
export const technologyAssets = {
  createAsset: (input: { organizationId: string; type: string; label: string; warrantyExpiresAt?: string; licenseExpiresAt?: string }) =>
    request<{ asset: TechnologyAsset }>("/technology-assets", { method: "POST", body: { kind: "asset", ...input } }),
  recordBackup: (input: { organizationId: string; websiteProfileId: string; category: string; location: string }) =>
    request<{ backup: BackupRecord }>("/technology-assets", { method: "POST", body: { kind: "backup", ...input } }),
  list: (organizationId: string) => request<{ assets: TechnologyAsset[] }>("/technology-assets", { query: { organizationId } }),
  verifyBackup: (backupId: string) => request<{ backup: BackupRecord }>("/technology-assets", { method: "PATCH", body: { backupId } }),
};

// ---- F048/F037 Reminders ----
export const reminders = {
  create: (input: { organizationId: string; subjectId: string; subjectType: string; expiresAt: string }) =>
    request<{ reminder: Reminder }>("/reminders", { method: "POST", body: input }),
  list: (organizationId: string) => request<{ reminders: Reminder[] }>("/reminders", { query: { organizationId } }),
};

// ---- F046/F047 Readiness Checklists (Session 20 customer/staff split) ----
export const checklists = {
  createDefinition: (title: string, items: ChecklistDefinition["items"]) =>
    request<{ definition: ChecklistDefinition }>("/checklists", { method: "POST", body: { title, items } }),
  list: (organizationId: string) => request<{ definitions: ChecklistDefinitionSummary[] }>("/checklists", { query: { organizationId } }),
  getForCustomer: (organizationId: string, checklistDefinitionId: string) =>
    request<CustomerChecklistView>("/checklists", { query: { organizationId, checklistDefinitionId } }),
  getForStaff: (organizationId: string, checklistDefinitionId: string) =>
    request<StaffChecklistView>("/checklists", { query: { organizationId, checklistDefinitionId } }),
  answer: (organizationId: string, checklistDefinitionId: string, itemKey: string, met: boolean, comment?: string) =>
    request<{ message: string }>("/checklists", { method: "PATCH", body: { action: "customerAnswer", organizationId, checklistDefinitionId, itemKey, met, comment } }),
  submit: (organizationId: string, checklistDefinitionId: string) =>
    request<{ message: string; submission: ChecklistSubmission }>("/checklists", { method: "PATCH", body: { action: "submit", organizationId, checklistDefinitionId } }),
  staffAssess: (organizationId: string, checklistDefinitionId: string, itemKey: string, staffVerified: boolean, options?: { met?: boolean; staffNote?: string }) =>
    request<{ message: string }>("/checklists", { method: "PATCH", body: { action: "staffAssess", organizationId, checklistDefinitionId, itemKey, staffVerified, ...options } }),
  review: (organizationId: string, checklistDefinitionId: string, reviewAction: "return" | "verify", reviewNote?: string) =>
    request<{ message: string; submission: ChecklistSubmission }>("/checklists", { method: "PATCH", body: { action: "review", organizationId, checklistDefinitionId, reviewAction, reviewNote } }),
};

// ---- F054 Metrics (platform_admin, cross-org) ----
export const metrics = {
  summary: (from: string, to: string) => request<{ summary: MetricsSummary }>("/metrics", { query: { from, to } }),
};

// ---- F055 Templates ----
export const templates = {
  create: (input: { key: string; subject: string; body: string; allowedVariables: string[] }) =>
    request<{ definition: TemplateDefinition }>("/templates", { method: "POST", body: input }),
  render: (key: string, variables: Record<string, string>) =>
    request<{ rendered: RenderedTemplate }>("/templates", { query: { key, ...variables } }),
};

// ---- F057 Webhook Events (platform_admin, read-only log review) ----
export const webhookEvents = {
  list: (provider: string) => request<{ events: WebhookEvent[] }>("/webhook-events", { query: { provider } }),
};

// ---- F008 Audit Log (platform_admin only) ----
export const auditLog = {
  query: (filters: {
    organizationId?: string;
    actorId?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
    cursor?: string;
    limit?: number;
  }) => request<AuditLogPage>("/audit-log", { query: filters }),
};

// ---- Account (existing pre-Care-Hub endpoint, reused as-is) ----
export const account = {
  get: () => request<{ user: AuthenticatedUser & { preferences: Record<string, unknown> } }>("/account"),
};

export const api = {
  auth,
  account,
  organizations,
  workQueue,
  approvals,
  invitations,
  tickets,
  ticketWorkflow,
  itSupport,
  workLog,
  activityTimeline,
  scopeOfWork,
  changeOrders,
  paymentRequests,
  serviceRecords,
  websiteProfiles,
  entitlements,
  subscriptions,
  technologyAssets,
  reminders,
  checklists,
  metrics,
  templates,
  webhookEvents,
  auditLog,
};

export default api;
