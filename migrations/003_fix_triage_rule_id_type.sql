-- Migration 003 -- fixes a real bug caught by Session 19's live smoke
-- test: triage_results.matched_rule_id was UUID with a foreign key into
-- triage_rules(id), but src/domain/triage.js's TriageRule.id has always
-- just been `string` -- triage rules are caller-supplied configuration
-- (classifyTicket(rules, ticket)), never fetched from a triage_rules
-- table row. No code anywhere creates or reads triage_rules, so the FK
-- constraint could never be satisfied by a real triage result, and a
-- config-driven rule id like "rule-it" (used throughout tests and the
-- Session 19 smoke test) fails with "invalid input syntax for type uuid".

ALTER TABLE triage_results DROP CONSTRAINT IF EXISTS triage_results_matched_rule_id_fkey;
ALTER TABLE triage_results ALTER COLUMN matched_rule_id TYPE TEXT;
