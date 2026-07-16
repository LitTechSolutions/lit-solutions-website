const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createInvitation,
  getInvitationById,
  getInvitationByTokenHash,
  listInvitationsForOrganization,
  resendInvitation,
  revokeInvitation,
  acceptInvitation,
} = require("./invitationStore");
const { hashInvitationToken } = require("../policy/invitationLifecycle");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
let idCounter = 0;
const SEQUENTIAL_ID = () => `inv-${++idCounter}`;
const FIXED_RANDOM_BYTES = (size) => Buffer.alloc(size, 7); // deterministic, non-zero token for tests

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("audit_events")) return [];
    if (text.includes("invitations")) return byTable.invitations || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function invitationRow(overrides = {}) {
  return {
    id: "inv-1", organization_id: "org-a", email: "customer@example.com", role: "org_member",
    status: "pending", invited_by: "admin-1", created_at: "2026-07-01T00:00:00.000Z",
    expires_at: "2026-07-22T00:00:00.000Z", accepted_at: null,
    token_hash: hashInvitationToken(FIXED_RANDOM_BYTES(32).toString("hex")),
    revoked_at: null, revoked_by: null, resend_count: 0, last_sent_at: null,
    ...overrides,
  };
}

test("createInvitation validates, inserts, audits, and returns the raw token exactly once", async () => {
  idCounter = 0;
  const sql = routingFakeSql({});
  const auditRecorder = fakeAuditRecorder();
  const { invitation, token } = await createInvitation(
    { organizationId: "org-a", email: "Customer@Example.com", role: "org_member", invitedBy: "admin-1" },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder, randomBytes: FIXED_RANDOM_BYTES }
  );
  assert.equal(invitation.email, "customer@example.com", "email is lowercased before storage");
  assert.equal(invitation.status, "pending");
  assert.equal(typeof token, "string");
  assert.equal(token.length, 64);
  assert.match(sql.calls[0].text, /INSERT INTO invitations/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "invitation.create");
  assert.equal(auditRecorder.events[0].outcome, "success");
});

test("createInvitation rejects inviting directly into platform_admin", async () => {
  const sql = routingFakeSql({});
  await assert.rejects(() =>
    createInvitation({ organizationId: "org-a", email: "x@example.com", role: "platform_admin", invitedBy: "admin-1" }, { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID })
  );
  assert.equal(sql.calls.length, 0);
});

test("getInvitationById returns null for no match", async () => {
  const sql = routingFakeSql({ invitations: [] });
  assert.equal(await getInvitationById("nope", { sql }), null);
});

test("getInvitationByTokenHash never returns the token_hash field to the caller", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const invitation = await getInvitationByTokenHash("some-hash", { sql });
  assert.equal("tokenHash" in invitation, false);
  assert.equal("token_hash" in invitation, false);
});

test("listInvitationsForOrganization orders by created_at DESC", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const list = await listInvitationsForOrganization("org-a", { sql });
  assert.equal(list.length, 1);
  assert.match(sql.calls[0].text, /ORDER BY created_at DESC/);
});

test("resendInvitation issues a fresh token and extends the window for a pending invitation", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const auditRecorder = fakeAuditRecorder();
  const { invitation, token } = await resendInvitation("inv-1", { sql, now: FIXED_NOW, auditRecorder, randomBytes: () => Buffer.alloc(32, 9) });
  assert.equal(typeof token, "string");
  assert.match(sql.calls[1].text, /UPDATE invitations/);
  assert.match(sql.calls[1].text, /resend_count = resend_count \+ 1/);
  assert.equal(auditRecorder.events[0].action, "invitation.resend");
  assert.equal(auditRecorder.events[0].metadata.resendCount, 1, "audit metadata reflects the NEW count (old + 1), not the stale pre-increment value");
});

test("resendInvitation's audit metadata resendCount increments correctly across a second resend", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow({ resend_count: 1 })] });
  const auditRecorder = fakeAuditRecorder();
  await resendInvitation("inv-1", { sql, now: FIXED_NOW, auditRecorder, randomBytes: () => Buffer.alloc(32, 9) });
  assert.equal(auditRecorder.events[0].metadata.resendCount, 2);
});

test("resendInvitation refuses to resend an already-accepted invitation", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow({ status: "accepted" })] });
  await assert.rejects(() => resendInvitation("inv-1", { sql, now: FIXED_NOW }), /not pending/);
});

test("resendInvitation throws for a nonexistent invitation", async () => {
  const sql = routingFakeSql({ invitations: [] });
  await assert.rejects(() => resendInvitation("nope", { sql, now: FIXED_NOW }), /no invitation/);
});

test("revokeInvitation transitions a pending invitation and audits it", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const auditRecorder = fakeAuditRecorder();
  const revoked = await revokeInvitation("inv-1", "admin-1", { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.revokedBy, "admin-1");
  assert.equal(auditRecorder.events[0].action, "invitation.revoke");
});

test("revokeInvitation refuses to revoke an already-terminal invitation", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow({ status: "revoked" })] });
  await assert.rejects(() => revokeInvitation("inv-1", "admin-1", { sql, now: FIXED_NOW }), /terminal/);
});

test("acceptInvitation redeems a valid pending token and audits success", async () => {
  const rawToken = "a".repeat(64);
  const sql = routingFakeSql({ invitations: [invitationRow({ token_hash: hashInvitationToken(rawToken) })] });
  const auditRecorder = fakeAuditRecorder();
  const accepted = await acceptInvitation(rawToken, { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(accepted.status, "accepted");
  assert.equal(auditRecorder.events[0].action, "invitation.accept");
  assert.equal(auditRecorder.events[0].outcome, "success");
});

test("acceptInvitation rejects an unknown token with a generic message and audits the denial", async () => {
  const sql = routingFakeSql({ invitations: [] });
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => acceptInvitation("b".repeat(64), { sql, now: FIXED_NOW, auditRecorder }), /invalid or has expired/);
  assert.equal(auditRecorder.events[0].outcome, "denied");
  assert.equal(auditRecorder.events[0].metadata.reason, "token not found");
});

test("acceptInvitation rejects an already-accepted token with the SAME generic message (no enumeration via error text)", async () => {
  const rawToken = "c".repeat(64);
  const sql = routingFakeSql({ invitations: [invitationRow({ token_hash: hashInvitationToken(rawToken), status: "accepted" })] });
  await assert.rejects(() => acceptInvitation(rawToken, { sql, now: FIXED_NOW }), /invalid or has expired/);
});

test("acceptInvitation rejects an expired token even if not yet marked expired (race safety)", async () => {
  const rawToken = "d".repeat(64);
  const sql = routingFakeSql({ invitations: [invitationRow({ token_hash: hashInvitationToken(rawToken), expires_at: "2026-07-01T00:00:00.000Z" })] });
  await assert.rejects(() => acceptInvitation(rawToken, { sql, now: FIXED_NOW }), /invalid or has expired/);
});

test("acceptInvitation: two simultaneous accepts of the same token -- only one can win", async () => {
  // Simulates a concurrent second request having already redeemed this
  // exact token between our fetch and our write -- the guarded UPDATE
  // (WHERE status = the status we read) matches no row, so the second
  // caller is rejected instead of falsely succeeding a second time.
  const rawToken = "e".repeat(64);
  const row = invitationRow({ token_hash: hashInvitationToken(rawToken) });
  const auditRecorder = fakeAuditRecorder();
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("UPDATE invitations")) return [];
    if (text.includes("invitations")) return [row];
    return [];
  };
  sql.calls = calls;
  await assert.rejects(() => acceptInvitation(rawToken, { sql, now: FIXED_NOW, auditRecorder }), /invalid or has expired/);
  const denial = auditRecorder.events.at(-1);
  assert.equal(denial.outcome, "denied");
  assert.match(denial.metadata.reason, /concurrent accept/);
});
