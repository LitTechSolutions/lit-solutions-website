-- Migration 004 -- Session 20 owner decision #3: split the F046/F047
-- readiness-checklist data into customer-editable answers/comments vs.
-- staff-only notes/verification, plus a real submission workflow
-- (draft -> submitted -> returned/verified) so "Submitted for review"
-- and staff sign-off are real, auditable states rather than an
-- immediate shared write.
--
-- checklist_responses previously held ONE shared (met) value per
-- (org, definition, item) with no notion of who answered it or whether
-- staff had reviewed it. This adds:
--   comment         -- customer-editable comment, meaningful only for
--                      "customer"-audience items (see checklist_definitions.items[].audience,
--                      an application-level JSONB field, no schema change needed for that part)
--   staff_note      -- staff-only internal note, NEVER returned to a customer-facing read
--   staff_verified  -- staff verification status for this specific item

ALTER TABLE checklist_responses
  ADD COLUMN comment TEXT,
  ADD COLUMN staff_note TEXT,
  ADD COLUMN staff_verified BOOLEAN NOT NULL DEFAULT false;

-- One row per (organization, checklist definition) -- the submission-
-- workflow state, distinct from the individual item answers above. See
-- src/policy/checklistSubmissionWorkflow.js for the legal-transition
-- state machine this backs.
CREATE TABLE checklist_submissions (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  checklist_definition_id UUID NOT NULL REFERENCES checklist_definitions(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'returned', 'verified')) DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_note TEXT,
  PRIMARY KEY (organization_id, checklist_definition_id)
);
