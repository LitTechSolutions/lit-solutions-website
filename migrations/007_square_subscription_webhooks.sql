-- Square subscription webhook integration.
--
-- Square is the source of truth for whether a website subscription is being
-- paid for. This adds the two things needed to consume its webhooks safely:
-- idempotency (Square retries, and its signature carries no timestamp, so
-- event-id deduplication is the only replay defence available) and a landing
-- place for subscriptions that arrive before we know who the customer is.

-- ============================================================
-- Idempotency for inbound webhooks
-- ============================================================
-- Square retries a delivery until it gets a 2xx, so the same event_id can
-- arrive many times. Without this, a redelivered subscription.canceled would
-- be re-applied and a redelivered created would double-insert.
ALTER TABLE webhook_events ADD COLUMN provider_event_id TEXT;

-- Partial unique index: legacy rows (and any provider that doesn't supply an
-- event id) stay unconstrained, while Square's deliveries dedupe on arrival.
CREATE UNIQUE INDEX idx_webhook_events_provider_event_id
  ON webhook_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- ============================================================
-- Square subscription links
-- ============================================================
-- A subscription is paid for on Square before the customer exists in the Care
-- Hub -- they've just handed over money, they have no organization, and per
-- terms.html section 18 the Care Hub is invitation-only, so we deliberately do
-- NOT auto-create an organization from webhook data. Doing that would mint a
-- junk org for every test payment and skip the human onboarding step entirely.
--
-- Instead every Square subscription lands here immediately, unlinked. Staff
-- link it to an organization during onboarding, at which point the internal
-- `subscriptions` record is created and the existing lifecycle state machine
-- (src/policy/subscriptionLifecycle.js) takes over.
CREATE TABLE square_subscription_links (
  square_subscription_id TEXT PRIMARY KEY,
  square_customer_id TEXT,
  square_plan_variation_id TEXT,
  square_status TEXT NOT NULL,
  customer_email TEXT,
  customer_name TEXT,

  -- Null until staff link this payment to a Care Hub organization.
  organization_id UUID REFERENCES organizations(id),
  -- Null until the internal subscription record is created at link time.
  subscription_id UUID REFERENCES subscriptions(id),

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_type TEXT,
  linked_at TIMESTAMPTZ
);

-- The work queue: "money has arrived, nobody has onboarded them yet".
CREATE INDEX idx_square_links_unlinked
  ON square_subscription_links(first_seen_at DESC)
  WHERE organization_id IS NULL;

CREATE INDEX idx_square_links_org
  ON square_subscription_links(organization_id);

-- One Square subscription maps to at most one internal subscription record.
CREATE UNIQUE INDEX idx_subscriptions_provider_reference
  ON subscriptions(provider_subscription_reference)
  WHERE provider_subscription_reference IS NOT NULL;
