-- 001_initial_schema.sql
-- LTS Business Care Hub -- initial PostgreSQL schema (Neon).
--
-- Scope: relational entities only. Netlify Blobs remains the store of
-- record for users/sessions/tokens (F003/F004, unmodified, reused as-is)
-- and CMS content -- see docs/development/DATA_MODEL.md and
-- ARCHITECTURE.md Section 3.3 for the split rationale.
--
-- Every table mirrors an existing, already-tested src/domain/*.js type.
-- IDs are application-generated UUIDs (crypto.randomUUID(), already the
-- convention throughout src/), not database-generated, so app code and
-- schema agree on id format without a round trip.
--
-- This migration has NOT been run against a live database -- no Neon
-- project exists yet in this environment. Run after DATABASE_URL is
-- configured. Per MIGRATION_PLAN.md's protocol: this is a greenfield
-- schema (no existing production data for these tables), so steps 3-4
-- (backup/dry-run against existing data) don't apply; steps 1-2
-- (inventory, mapping) are this file itself, and step 7 (post-cutover
-- smoke test) still applies once run for real.

-- ============================================================
-- F001 -- Organizations & Memberships
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL, -- references the Blobs `users` store's id -- no DB FK across stores
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL, -- Blobs `users` store id
  role TEXT NOT NULL CHECK (role IN ('platform_admin', 'technician', 'org_owner', 'org_member', 'read_only_customer', 'automated_service')),
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended', 'revoked')),
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_memberships_user ON organization_memberships(user_id);
CREATE INDEX idx_memberships_org_status ON organization_memberships(organization_id, status);

-- F002 -- Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role NOT IN ('platform_admin', 'automated_service')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_org ON invitations(organization_id);

-- ============================================================
-- F008 -- Audit events (moved off Blobs specifically for real indexes --
-- see src/db/pgAuditSink.js)
-- ============================================================

CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'automated_service', 'system')),
  actor_id TEXT NOT NULL,
  actor_role TEXT,
  organization_id UUID REFERENCES organizations(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  metadata JSONB -- validated at the app layer (assertValidAuditEvent) to contain only primitives
);
CREATE INDEX idx_audit_org ON audit_events(organization_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON audit_events(actor_id, occurred_at DESC);
CREATE INDEX idx_audit_action ON audit_events(action, occurred_at DESC);

-- ============================================================
-- F010 -- Service records
-- ============================================================

CREATE TABLE service_records (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  category TEXT NOT NULL CHECK (category IN ('website', 'it', 'security', 'recurring_service')),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_service_records_org ON service_records(organization_id, status);

-- ============================================================
-- F014 -- Documents, F015 -- File assets
-- ============================================================

CREATE TABLE care_hub_documents (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  kind TEXT NOT NULL CHECK (kind IN ('proposal', 'agreement', 'invoice', 'receipt', 'report', 'handoff')),
  title TEXT NOT NULL,
  storage_ref TEXT NOT NULL, -- opaque pointer into object storage, never a data URI -- see OWNER_DECISIONS.md #1 follow-on (object storage target)
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_documents_org ON care_hub_documents(organization_id, kind);

CREATE TABLE file_assets (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  scan_status TEXT NOT NULL CHECK (scan_status IN ('pending_scan', 'clean', 'quarantined', 'rejected')),
  storage_ref TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by TEXT NOT NULL
);
CREATE INDEX idx_file_assets_org ON file_assets(organization_id);

-- ============================================================
-- F016 -- Approvals (covers scope/change_order/deliverable/document subjects)
-- ============================================================

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('scope', 'change_order', 'deliverable', 'document')),
  subject_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  decision_note TEXT
);
CREATE INDEX idx_approvals_org_status ON approval_requests(organization_id, status);

-- ============================================================
-- F017 -- Activity events (customer-facing timeline; distinct from audit_events)
-- ============================================================

CREATE TABLE activity_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('project', 'ticket', 'approval', 'document', 'payment', 'service_event')),
  source_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  customer_visible BOOLEAN NOT NULL
);
CREATE INDEX idx_activity_org_time ON activity_events(organization_id, occurred_at DESC);

-- ============================================================
-- F012 -- Notification preferences, F013 -- Message thread refs
-- ============================================================

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY,
  channels_by_urgency JSONB NOT NULL, -- Record<urgency, channel[]>, validated at the app layer
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE message_thread_refs (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL, -- existing Blobs messages.js key, preserved for compatibility
  service_record_id UUID REFERENCES service_records(id),
  PRIMARY KEY (organization_id, customer_id)
);

-- ============================================================
-- F019/F023/F029 -- Tickets
-- ============================================================

CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  category TEXT NOT NULL CHECK (category IN ('website_change', 'it_support', 'question', 'other')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'triaged', 'assigned', 'in_progress', 'waiting_on_customer', 'resolved', 'closed', 'reopened')),
  details JSONB, -- optional category-specific context, see src/policy/ticketSubmission.js (no placeholder-junk values, enforced at the app layer)
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_tickets_org_status ON tickets(organization_id, status);

-- F020 -- Triage (rule table is business configuration, not seeded here -- see OWNER_DECISIONS.md #10)
CREATE TABLE triage_rules (
  id UUID PRIMARY KEY,
  match JSONB NOT NULL,
  queue TEXT NOT NULL,
  priority INTEGER NOT NULL
);

CREATE TABLE triage_results (
  ticket_id UUID PRIMARY KEY REFERENCES tickets(id),
  queue TEXT NOT NULL,
  matched_rule_id UUID REFERENCES triage_rules(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F021 -- Priority assessments
CREATE TABLE priority_assessments (
  ticket_id UUID PRIMARY KEY REFERENCES tickets(id),
  level TEXT NOT NULL CHECK (level IN ('low', 'medium', 'high', 'critical')),
  score NUMERIC NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F022 -- Assignments
CREATE TABLE assignments (
  ticket_id UUID PRIMARY KEY REFERENCES tickets(id),
  technician_user_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by TEXT NOT NULL
);
CREATE INDEX idx_assignments_technician ON assignments(technician_user_id);

-- F025 -- Time entries, internal notes
CREATE TABLE time_entries (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  technician_user_id TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);
CREATE INDEX idx_time_entries_ticket ON time_entries(ticket_id);

CREATE TABLE internal_notes (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_visible BOOLEAN NOT NULL DEFAULT false CHECK (customer_visible = false)
);
CREATE INDEX idx_internal_notes_ticket ON internal_notes(ticket_id);

-- ============================================================
-- F026/F027 -- Scope of work & change orders (no dollar amounts -- see priceRef)
-- ============================================================

CREATE TABLE scope_of_work (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'superseded')),
  assumptions JSONB,
  exclusions JSONB,
  line_items JSONB NOT NULL, -- [{ description, quantity, priceRef }], validated at the app layer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);
CREATE INDEX idx_scope_ticket ON scope_of_work(ticket_id, version);

CREATE TABLE change_orders (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  original_scope_id UUID NOT NULL REFERENCES scope_of_work(id),
  description TEXT NOT NULL,
  added_line_items JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

-- ============================================================
-- F028 -- Payment requests (amount_ref, not a dollar amount -- pricing blocked)
-- ============================================================

CREATE TABLE payment_requests (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  amount_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'paid', 'reconciliation_pending', 'reconciled', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_reference TEXT
);
CREATE INDEX idx_payment_requests_org_status ON payment_requests(organization_id, status);

-- ============================================================
-- F049 -- Entitlement limits & usage (limits are owner-configured content,
-- not seeded here -- see OWNER_DECISIONS.md #3)
-- ============================================================

CREATE TABLE entitlement_limits (
  plan_key TEXT NOT NULL,
  usage_key TEXT NOT NULL,
  limit_value INTEGER,
  reset_period TEXT NOT NULL CHECK (reset_period IN ('monthly', 'total', 'unlimited')),
  PRIMARY KEY (plan_key, usage_key)
);

CREATE TABLE usage_records (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  plan_key TEXT NOT NULL,
  usage_key TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_usage_org_period ON usage_records(organization_id, plan_key, usage_key, period_start);

-- ============================================================
-- F050 -- Price sheets (content is owner-approved business data, not seeded here -- OWNER_DECISIONS.md #2)
-- ============================================================

CREATE TABLE price_sheets (
  id UUID PRIMARY KEY,
  items JSONB NOT NULL,
  discounts JSONB NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL
);

-- ============================================================
-- F052 -- Subscriptions
-- ============================================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  provider_subscription_reference TEXT
);
CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id, status);

-- ============================================================
-- F043 -- Technology assets, F048/F037 -- Lifecycle reminders
-- ============================================================

CREATE TABLE technology_assets (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL CHECK (type IN ('computer', 'printer', 'network_device', 'software', 'other')),
  label TEXT NOT NULL,
  warranty_expires_at TIMESTAMPTZ,
  license_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tech_assets_org ON technology_assets(organization_id);

CREATE TABLE lifecycle_reminders (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  subject_id UUID NOT NULL, -- a technology_assets.id (F048) or website_profiles.id (F037)
  subject_type TEXT NOT NULL CHECK (subject_type IN ('warranty', 'license', 'domain', 'ssl_certificate', 'subscription')),
  expires_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_reminders_pending ON lifecycle_reminders(expires_at) WHERE sent = false;

-- ============================================================
-- F031/F035-F042 -- Website Care
-- ============================================================

CREATE TABLE website_profiles (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  primary_url TEXT NOT NULL,
  domain_registrar TEXT,
  hosting_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_website_profiles_org ON website_profiles(organization_id);

CREATE TABLE website_check_results (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  website_profile_id UUID NOT NULL REFERENCES website_profiles(id),
  check_type TEXT NOT NULL CHECK (check_type IN ('contact_form', 'broken_links', 'performance', 'accessibility', 'uptime')),
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'warning', 'fail')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence JSONB NOT NULL
);
CREATE INDEX idx_website_checks_profile ON website_check_results(website_profile_id, checked_at DESC);

CREATE TABLE incident_records (
  id UUID PRIMARY KEY,
  website_profile_id UUID NOT NULL REFERENCES website_profiles(id),
  status TEXT NOT NULL CHECK (status IN ('up', 'investigating', 'down', 'resolved')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_profile ON incident_records(website_profile_id, updated_at DESC);

CREATE TABLE backup_records (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  website_profile_id UUID NOT NULL REFERENCES website_profiles(id),
  category TEXT NOT NULL CHECK (category IN ('source', 'content', 'assets', 'database', 'configuration')),
  location TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  restore_verified BOOLEAN NOT NULL DEFAULT false,
  restore_verified_at TIMESTAMPTZ
);
CREATE INDEX idx_backups_profile ON backup_records(website_profile_id, taken_at DESC);

-- ============================================================
-- F046/F047/F034 -- Readiness checklists (definitions are business content,
-- not seeded here -- see OWNER_DECISIONS.md #10)
-- ============================================================

CREATE TABLE checklist_definitions (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  items JSONB NOT NULL -- [{ key, label, weight }]
);

CREATE TABLE checklist_responses (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  checklist_definition_id UUID NOT NULL REFERENCES checklist_definitions(id),
  item_key TEXT NOT NULL,
  met BOOLEAN NOT NULL, -- boolean only, structurally cannot carry a credential (see src/domain/readinessChecklist.js)
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, checklist_definition_id, item_key)
);

-- ============================================================
-- F055 -- Communication templates (copy is business content, not seeded here)
-- ============================================================

CREATE TABLE template_definitions (
  id UUID PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  allowed_variables JSONB NOT NULL
);
