(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ltsPlanRecommender = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var PLANS = {
    standard: {
      name: 'Standard',
      dueToday: '$228',
      monthly: '$79/month',
      anchor: '#plan-standard',
      reason: 'You need a focused business presence with essential pages and light monthly updates.'
    },
    premium: {
      name: 'Premium',
      dueToday: '$378',
      monthly: '$129/month',
      anchor: '#plan-premium',
      reason: 'You need more content, lead-generation features, or several handled updates each month.'
    },
    executive: {
      name: 'Executive',
      dueToday: '$598',
      monthly: '$199/month',
      anchor: '#plan-executive',
      reason: 'You need accounts, advanced tools, managed content, or administrator editing access.'
    }
  };

  function recommendPlan(answers) {
    answers = answers || {};
    if (answers.goal === 'advanced' || answers.content === 'advanced' || answers.updates === 'self') {
      return PLANS.executive;
    }
    if (answers.goal === 'leads' || answers.content === 'growing' || answers.updates === 'regular') {
      return PLANS.premium;
    }
    return PLANS.standard;
  }

  function mountPlanFinder() {
    var form = document.getElementById('planFinderForm');
    var result = document.getElementById('planFinderResult');
    if (!form || !result) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      var values = new FormData(form);
      var plan = recommendPlan({
        goal: values.get('goal'),
        content: values.get('content'),
        updates: values.get('updates')
      });

      result.innerHTML =
        '<p class="eyebrow">Your starting point</p>' +
        '<h3>' + plan.name + '</h3>' +
        '<p class="plan-result-price"><strong>' + plan.dueToday + '</strong> due today, then <strong>' + plan.monthly + '</strong>.</p>' +
        '<p>' + plan.reason + '</p>' +
        '<a class="btn btn-primary" href="' + plan.anchor + '">See the ' + plan.name + ' plan</a>' +
        '<p class="plan-result-note">This is a guide, not a commitment. We will confirm the right scope before work begins.</p>';
      result.hidden = false;
      result.setAttribute('tabindex', '-1');
      result.focus();
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', mountPlanFinder);
  }

  return {
    PLANS: PLANS,
    recommendPlan: recommendPlan,
    mountPlanFinder: mountPlanFinder
  };
});
