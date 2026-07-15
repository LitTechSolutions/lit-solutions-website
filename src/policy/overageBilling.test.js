const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateCarePlanOverage,
  calculateItPlanRemoteOverage,
  calculateItPlanOnsite,
  roundUpToIncrement,
} = require("./overageBilling");

test("no overage means no charge", () => {
  assert.deepEqual(calculateCarePlanOverage(0), { billedMinutes: 0, cost: 0 });
});

test("Care Plan overage: exactly one 15-minute increment at $85/hr", () => {
  const result = calculateCarePlanOverage(15);
  assert.equal(result.billedMinutes, 15);
  assert.equal(result.cost, 21.25); // 85 * (15/60)
});

test("Care Plan overage: a partial increment rounds UP to the next full increment", () => {
  const result = calculateCarePlanOverage(16); // just past 15 min -> billed as 30
  assert.equal(result.billedMinutes, 30);
  assert.equal(result.cost, 42.5);
});

test("Care Plan overage: exactly one hour", () => {
  const result = calculateCarePlanOverage(60);
  assert.equal(result.cost, 85);
});

test("IT Plan remote overage: $95/hr, 15-minute increments", () => {
  const result = calculateItPlanRemoteOverage(45);
  assert.equal(result.billedMinutes, 45);
  assert.equal(result.cost, 71.25); // 95 * 0.75
});

test("IT Plan remote overage: 1-minute over rounds up to a full 15-minute increment", () => {
  const result = calculateItPlanRemoteOverage(1);
  assert.equal(result.billedMinutes, 15);
});

test("IT Plan on-site: a 20-minute visit is billed at the 1-hour minimum, not 20 minutes", () => {
  const result = calculateItPlanOnsite(20);
  assert.equal(result.billedMinutes, 60);
  assert.equal(result.cost, 125);
});

test("IT Plan on-site: work beyond the 1-hour minimum rounds up to the next 15-minute increment", () => {
  const result = calculateItPlanOnsite(75); // 1hr 15min exactly -> no rounding needed
  assert.equal(result.billedMinutes, 75);
  assert.equal(result.cost, 156.25); // 125 * 1.25

  const overResult = calculateItPlanOnsite(80); // just past 75 -> rounds to 90
  assert.equal(overResult.billedMinutes, 90);
});

test("IT Plan on-site rejects zero or negative minutes (a visit happened or it didn't)", () => {
  assert.throws(() => calculateItPlanOnsite(0));
  assert.throws(() => calculateItPlanOnsite(-10));
});

test("rejects negative overage minutes for remote calculations", () => {
  assert.throws(() => calculateCarePlanOverage(-5));
  assert.throws(() => calculateItPlanRemoteOverage(-5));
});

test("roundUpToIncrement is exported and rounds to the nearest 15", () => {
  assert.equal(roundUpToIncrement(1), 15);
  assert.equal(roundUpToIncrement(15), 15);
  assert.equal(roundUpToIncrement(16), 30);
});
