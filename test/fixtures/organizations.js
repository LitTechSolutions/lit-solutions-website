// Synthetic two-organization tenant-isolation fixture set, ready for F001
// once its persistence layer is unblocked (OWNER_DECISIONS.md #1). Every
// customer-data test suite in this codebase should exercise at least this
// matrix, per the master instruction's authorization-testing requirement:
// Org A, Org B, an authorized user, an unauthorized user, a staff user,
// and a suspended user.
//
// All synthetic -- no real customer names, emails, or data.

const ORG_A = Object.freeze({
  id: "org-fixture-a",
  name: "Fixture Organization A",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "user-fixture-platform-admin",
  version: 1,
});

const ORG_B = Object.freeze({
  id: "org-fixture-b",
  name: "Fixture Organization B",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "user-fixture-platform-admin",
  version: 1,
});

const USERS = Object.freeze({
  platformAdmin: Object.freeze({ id: "user-fixture-platform-admin", email: "fixture-admin@example.test" }),
  orgAOwner: Object.freeze({ id: "user-fixture-org-a-owner", email: "fixture-a-owner@example.test" }),
  orgAMember: Object.freeze({ id: "user-fixture-org-a-member", email: "fixture-a-member@example.test" }),
  orgASuspendedMember: Object.freeze({ id: "user-fixture-org-a-suspended", email: "fixture-a-suspended@example.test" }),
  orgBOwner: Object.freeze({ id: "user-fixture-org-b-owner", email: "fixture-b-owner@example.test" }),
  technician: Object.freeze({ id: "user-fixture-technician", email: "fixture-tech@example.test" }),
});

const MEMBERSHIPS = Object.freeze([
  Object.freeze({
    id: "membership-fixture-1",
    organizationId: ORG_A.id,
    userId: USERS.orgAOwner.id,
    role: "org_owner",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  Object.freeze({
    id: "membership-fixture-2",
    organizationId: ORG_A.id,
    userId: USERS.orgAMember.id,
    role: "org_member",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  Object.freeze({
    id: "membership-fixture-3",
    organizationId: ORG_A.id,
    userId: USERS.orgASuspendedMember.id,
    role: "org_member",
    status: "suspended",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  Object.freeze({
    id: "membership-fixture-4",
    organizationId: ORG_B.id,
    userId: USERS.orgBOwner.id,
    role: "org_owner",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
]);

module.exports = { ORG_A, ORG_B, USERS, MEMBERSHIPS };
