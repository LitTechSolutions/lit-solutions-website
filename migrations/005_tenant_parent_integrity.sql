-- Enforce that tenant-owned child records point to a parent owned by the
-- same organization. Handler checks provide a uniform not-found response;
-- these constraints are the final database boundary against cross-tenant
-- references from future code or operational mistakes.

ALTER TABLE tickets
  ADD CONSTRAINT uq_tickets_id_organization UNIQUE (id, organization_id);

ALTER TABLE scope_of_work
  ADD CONSTRAINT uq_scope_id_organization UNIQUE (id, organization_id);

ALTER TABLE scope_of_work
  ADD CONSTRAINT fk_scope_ticket_same_organization
  FOREIGN KEY (ticket_id, organization_id)
  REFERENCES tickets (id, organization_id)
  NOT VALID;

ALTER TABLE change_orders
  ADD CONSTRAINT fk_change_order_scope_same_organization
  FOREIGN KEY (original_scope_id, organization_id)
  REFERENCES scope_of_work (id, organization_id)
  NOT VALID;

-- Validation intentionally fails deployment if historical cross-tenant rows
-- exist, forcing review instead of silently preserving corrupt ownership.
ALTER TABLE scope_of_work VALIDATE CONSTRAINT fk_scope_ticket_same_organization;
ALTER TABLE change_orders VALIDATE CONSTRAINT fk_change_order_scope_same_organization;
