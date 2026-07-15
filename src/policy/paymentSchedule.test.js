const test = require("node:test");
const assert = require("node:assert/strict");
const { determinePaymentSchedule, DEPOSIT_THRESHOLD, DEPOSIT_RATE } = require("./paymentSchedule");

test("work below $500 is paid in full upfront, due upon approval", () => {
  const schedule = determinePaymentSchedule(499);
  assert.equal(schedule.scheduleType, "full_upfront");
  assert.equal(schedule.payments.length, 1);
  assert.equal(schedule.payments[0].amount, 499);
  assert.equal(schedule.payments[0].dueWhen, "upon_approval");
});

test("work at exactly $500 requires a deposit, not full upfront (threshold is inclusive)", () => {
  const schedule = determinePaymentSchedule(500);
  assert.equal(schedule.scheduleType, "deposit_balance");
});

test("work at $500 or more splits 50/50 into deposit (before work) and balance (upon completion)", () => {
  const schedule = determinePaymentSchedule(1000);
  assert.equal(schedule.scheduleType, "deposit_balance");
  assert.deepEqual(schedule.payments, [
    { label: "deposit", amount: 500, dueWhen: "before_work_begins" },
    { label: "balance", amount: 500, dueWhen: "upon_completion" },
  ]);
});

test("deposit/balance split rounds to the cent and still sums to the total for an odd amount", () => {
  const schedule = determinePaymentSchedule(999.99);
  const [deposit, balance] = schedule.payments;
  assert.equal(deposit.amount + balance.amount, 999.99);
});

test("third-party expenses are always full upfront, before work begins, regardless of amount", () => {
  const smallExpense = determinePaymentSchedule(50, { isThirdPartyExpense: true });
  const largeExpense = determinePaymentSchedule(5000, { isThirdPartyExpense: true });
  assert.equal(smallExpense.scheduleType, "full_upfront");
  assert.equal(smallExpense.payments[0].dueWhen, "before_work_begins");
  assert.equal(largeExpense.scheduleType, "full_upfront");
  assert.match(largeExpense.reason, /third-party/);
});

test("rejects a non-positive amount", () => {
  assert.throws(() => determinePaymentSchedule(0));
  assert.throws(() => determinePaymentSchedule(-100));
});

test("DEPOSIT_THRESHOLD and DEPOSIT_RATE are exported and match Dylan's approved policy exactly", () => {
  assert.equal(DEPOSIT_THRESHOLD, 500);
  assert.equal(DEPOSIT_RATE, 0.5);
});
