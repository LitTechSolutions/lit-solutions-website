// Authenticated Stripe success screen. The URL is a stable Google Ads
// conversion destination, but the purchase event only fires after our own
// orders endpoint confirms that Stripe's webhook marked the order paid.
(function () {
  var API = "/.netlify/functions/";
  var params = new URLSearchParams(window.location.search);
  var orderId = params.get("order") || sessionStorage.getItem("lts-last-paid-order") || "";
  if (orderId) sessionStorage.setItem("lts-last-paid-order", orderId);
  if (window.location.search) history.replaceState(null, "", window.location.pathname);
  if (window.LTS_CART) window.LTS_CART.clear();

  var title = document.getElementById("purchaseTitle");
  var lede = document.getElementById("purchaseLede");
  var eyebrow = document.getElementById("purchaseEyebrow");
  var summary = document.getElementById("purchaseSummary");
  var steps = document.getElementById("purchaseNextSteps");
  var briefStep = document.getElementById("briefStep");
  var actions = document.getElementById("purchaseActions");
  var icon = document.getElementById("purchaseStatusIcon");
  var attempts = 0;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    return "$" + ((Number(cents) || 0) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function trackPurchase(order) {
    if (!order || !order.id || order.amountPaidCents == null) return;
    var key = "lts-purchase-tracked:" + order.id;
    try { if (localStorage.getItem(key)) return; } catch (e) {}
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "purchase",
      ecommerce: {
        transaction_id: order.id,
        value: Number((order.amountPaidCents / 100).toFixed(2)),
        currency: "USD",
        items: (order.items || []).map(function (item) {
          return { item_id: item.key, item_name: item.name, quantity: item.quantity || 1 };
        }),
      },
    });
    try { localStorage.setItem(key, "1"); } catch (e) {}
  }

  function showConfirmed(order) {
    icon.classList.add("is-confirmed");
    eyebrow.textContent = "Payment confirmed";
    title.textContent = "Thank you for choosing Little Technical Solutions.";
    lede.textContent = "Your purchase is complete. Your receipt and project paperwork are ready in your account.";
    summary.hidden = false;
    summary.innerHTML =
      '<div><span>Purchase</span><strong>' + esc(order.summary) + '</strong></div>' +
      '<div><span>Paid today</span><strong>' + money(order.amountPaidCents != null ? order.amountPaidCents : order.chargedTodayCents) + '</strong></div>' +
      (order.monthlyCents ? '<div><span>Ongoing plan</span><strong>' + money(order.monthlyCents) + '/month</strong></div>' : '') +
      (order.balanceAtLaunchCents ? '<div><span>Due at launch</span><strong>' + money(order.balanceAtLaunchCents) + '</strong></div>' : '') +
      '<div><span>Order</span><strong>' + esc(order.id) + '</strong></div>';
    steps.hidden = false;
    briefStep.hidden = !order.needsBrief;
    actions.innerHTML = order.needsBrief
      ? '<a href="myaccount.html#brief" class="btn btn-primary">Complete your project brief</a><a href="myaccount.html#documents" class="btn btn-ghost">View receipt</a>'
      : '<a href="myaccount.html#purchases" class="btn btn-primary">View your purchases</a><a href="myaccount.html#documents" class="btn btn-ghost">View receipt</a>';
    trackPurchase(order);
  }

  function showProcessing(order) {
    eyebrow.textContent = "Payment processing";
    title.textContent = "You're all set. Your payment is settling.";
    lede.textContent = "Some bank and pay-over-time methods take a little longer to confirm. We'll email your receipt as soon as Stripe finishes.";
    if (order && order.needsBrief) {
      actions.innerHTML = '<a href="myaccount.html#brief" class="btn btn-primary">Complete your project brief</a><a href="myaccount.html#purchases" class="btn btn-ghost">View status</a>';
    }
  }

  function showProblem(message, signIn) {
    icon.classList.add("is-problem");
    eyebrow.textContent = signIn ? "Sign in required" : "We need one more moment";
    title.textContent = signIn ? "Your purchase is safe." : "We couldn't confirm the order on this screen.";
    lede.textContent = message;
    actions.innerHTML = signIn
      ? '<a href="myaccount.html#signin" class="btn btn-primary">Sign in to your account</a>'
      : '<a href="myaccount.html#purchases" class="btn btn-primary">Check purchase status</a><a href="tel:+18043090968" class="btn btn-ghost">Call 804-309-0968</a>';
  }

  async function load() {
    if (!orderId) {
      showProblem("Open Purchases in your account to see your orders and receipts.", false);
      return;
    }
    attempts++;
    try {
      var res = await fetch(API + "orders", { credentials: "same-origin", headers: { "Content-Type": "application/json" } });
      if (res.status === 401) {
        showProblem("Sign in with the same account you used at checkout to view your receipt and project details.", true);
        return;
      }
      if (!res.ok) throw new Error("orders unavailable");
      var body = await res.json();
      var order = (body.orders || []).find(function (item) { return item.id === orderId; });
      if (!order) {
        showProblem("We couldn't find this order in the signed-in account. Your card has not been charged twice. Please check Purchases or contact us.", false);
        return;
      }
      if (order.status === "paid" || order.status === "brief_submitted") {
        showConfirmed(order);
        return;
      }
      if (order.status === "payment_processing") {
        showProcessing(order);
        return;
      }
      if (order.status === "payment_review") {
        showProblem("The payment reached us, but its details need a quick manual review before work begins. We'll contact you, and you can call us any time.", false);
        return;
      }
      if (attempts < 12) {
        window.setTimeout(load, 1500);
        return;
      }
      showProblem("Stripe is taking longer than usual to finish confirming this payment. Check Purchases in a moment; we'll also email you as soon as it completes.", false);
    } catch (e) {
      if (attempts < 4) { window.setTimeout(load, 1500); return; }
      showProblem("Your payment page completed, but this screen couldn't reach the dashboard. Check your connection, then open Purchases.", false);
    }
  }

  load();
})();
