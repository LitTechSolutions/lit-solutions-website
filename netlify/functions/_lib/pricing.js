// pricing.js -- works out what a cart actually costs. Pure, and the only
// place money is calculated.
//
// Three rules interact, and the order matters:
//
// 1. Payment policy (terms.html section 3). Buy-outright website builds split
//    50/50 -- half now, half at launch. Everything else is due in full.
//
// 2. American Heroes Discount (heroes-pricing.html). 15% off one-time work,
//    5% off recurring. The rate follows the COMPONENT, not the product: a
//    subscription plan's deposit is one-time work and gets 15%, while its
//    monthly fee gets 5%. Applied only when the account carries a verified
//    hero status -- never taken from the request, because a self-declared
//    discount is just a price the customer picked.
//
// 3. Buy now, pay later. Stripe doesn't support BNPL in subscription mode,
//    which matches the policy anyway: BNPL pays us in full immediately and
//    the customer repays the provider, so there's no deposit to split.
//
// The subtlety that caused real bugs here: Stripe bills a recurring line
// IMMEDIATELY on checkout. So the amount taken today is the one-off component
// PLUS the first month, and a pure monthly subscription must emit only a
// recurring line -- adding a separate "first month" one-off charges it twice.
// chargedTodayCents is therefore the honest headline figure, with the
// breakdown alongside it.

const { monthlyCents: catalogMonthly, packageDepositCents, taxCodeFor, monthlyTaxCodeFor } = require("./product_catalog");

const HERO_ONE_TIME_RATE = 0.15;
const HERO_RECURRING_RATE = 0.05;

// Affirm/Klarna reject amounts outside their own limits, and a rejection on
// the Stripe page reads as "declined" to a customer. Only offer it in range.
const BNPL_MIN_CENTS = 5000;
const BNPL_MAX_CENTS = 3000000;

function applyDiscount(cents, rate) {
  return Math.max(0, Math.round(cents * (1 - rate)));
}

/** The one-time component of a line, before any discount. */
function listOneOffCents(product, payInFull) {
  switch (product.kind) {
    case "plan": return product.depositCents;
    case "package": return payInFull ? product.totalCents : packageDepositCents(product);
    case "service": return product.amountCents;
    // A pure subscription has NO one-time component. Its first month is
    // billed by the recurring line itself.
    case "subscription": return 0;
    default: return 0;
  }
}

function listMonthlyCents(product) {
  return catalogMonthly(product);
}

function hasRecurring(items) {
  return items.some(({ product }) => listMonthlyCents(product) > 0);
}

function bnplAvailable(items, priced) {
  if (hasRecurring(items)) return false;
  const full = priced.listChargedTodayCents;
  return full >= BNPL_MIN_CENTS && full <= BNPL_MAX_CENTS;
}

/**
 * @param {Array<{product: object, quantity: number}>} items
 * @param {{ hero?: boolean, payInFull?: boolean }} [opts]
 */
function priceCart(items, opts = {}) {
  const hero = !!opts.hero;
  const payInFull = !!opts.payInFull;

  const lines = [];
  let oneOffTotal = 0, monthlyTotal = 0, balanceTotal = 0;
  let listOneOffTotal = 0, listMonthlyTotal = 0;

  for (const { product, quantity } of items) {
    const qty = Math.max(1, Math.min(20, quantity || 1));

    const listOneOff = listOneOffCents(product, payInFull);
    const listMonthly = listMonthlyCents(product);

    const oneOff = hero ? applyDiscount(listOneOff, HERO_ONE_TIME_RATE) : listOneOff;
    const monthly = hero ? applyDiscount(listMonthly, HERO_RECURRING_RATE) : listMonthly;

    // A package not paid in full leaves the other half owed at launch.
    let balance = 0;
    if (product.kind === "package" && !payInFull) {
      const total = hero ? applyDiscount(product.totalCents, HERO_ONE_TIME_RATE) : product.totalCents;
      balance = total - oneOff;
    }

    lines.push({
      key: product.key,
      // Carried per line so toStripeLineItems doesn't need the catalog again,
      // and so a plan's build labour and its hosting can be coded separately.
      taxCode: taxCodeFor(product),
      monthlyTaxCode: monthlyTaxCodeFor(product),
      name: product.name,
      kind: product.kind,
      label: lineLabel(product, payInFull),
      quantity: qty,
      listOneOffCents: listOneOff * qty,
      oneOffCents: oneOff * qty,
      listMonthlyCents: listMonthly * qty,
      monthlyCents: monthly * qty,
      balanceAtLaunchCents: balance * qty,
    });

    oneOffTotal += oneOff * qty;
    monthlyTotal += monthly * qty;
    balanceTotal += balance * qty;
    listOneOffTotal += listOneOff * qty;
    listMonthlyTotal += listMonthly * qty;
  }

  // Stripe charges recurring lines immediately, so today's total includes the
  // first month. This is the number the cart must show.
  const chargedToday = oneOffTotal + monthlyTotal;
  const listChargedToday = listOneOffTotal + listMonthlyTotal;

  return {
    lines,
    hero,
    payInFull,
    oneOffCents: oneOffTotal,
    monthlyCents: monthlyTotal,
    chargedTodayCents: chargedToday,
    listChargedTodayCents: listChargedToday,
    balanceAtLaunchCents: balanceTotal,
    heroSavingCents: listChargedToday - chargedToday,
    heroSavingMonthlyCents: listMonthlyTotal - monthlyTotal,
    hasRecurring: monthlyTotal > 0,
    // True when today's charge is more than the one-off part, so the cart can
    // explain why (deposit + first month) rather than showing a bare total.
    includesFirstMonth: monthlyTotal > 0,
  };
}

function lineLabel(product, payInFull) {
  switch (product.kind) {
    case "plan": return `${product.name} website — deposit`;
    case "package": return payInFull ? `${product.name} — paid in full` : `${product.name} — 50% deposit`;
    case "subscription": return product.name;
    default: return product.name;
  }
}

/**
 * Stripe line items built from the PRICED cart, so what Stripe charges is
 * exactly what the customer was shown. A zero one-off emits no line -- that
 * is what stops a pure subscription being billed twice for month one.
 */
function toStripeLineItems(priced) {
  const out = [];
  for (const line of priced.lines) {
    if (line.oneOffCents > 0) {
      out.push({
        quantity: 1, // quantity is already folded into the amount
        price_data: {
          currency: "usd",
          unit_amount: line.oneOffCents,
          product_data: {
            name: line.quantity > 1 ? `${line.label} × ${line.quantity}` : line.label,
            // Required by Stripe Managed Payments: without it the session is
            // rejected outright with "the product tax code is missing".
            tax_code: line.taxCode,
          },
        },
      });
    }
    if (line.monthlyCents > 0) {
      out.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: line.monthlyCents,
          recurring: { interval: "month" },
          product_data: {
            name: `${line.name} — monthly${line.quantity > 1 ? ` × ${line.quantity}` : ""}`,
            tax_code: line.monthlyTaxCode,
          },
        },
      });
    }
  }
  return out;
}

module.exports = {
  HERO_ONE_TIME_RATE,
  HERO_RECURRING_RATE,
  BNPL_MIN_CENTS,
  BNPL_MAX_CENTS,
  applyDiscount,
  listOneOffCents,
  listMonthlyCents,
  hasRecurring,
  bnplAvailable,
  priceCart,
  toStripeLineItems,
  lineLabel,
};
