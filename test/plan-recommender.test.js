'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { recommendPlan, mountPlanFinder } = require('../js/plan-recommender.js');

test('recommends Standard for a small presence with light updates', () => {
  assert.equal(recommendPlan({ goal: 'presence', content: 'small', updates: 'light' }).name, 'Standard');
});

test('recommends Premium when any growth need is selected', () => {
  assert.equal(recommendPlan({ goal: 'leads', content: 'small', updates: 'light' }).name, 'Premium');
  assert.equal(recommendPlan({ goal: 'presence', content: 'growing', updates: 'light' }).name, 'Premium');
  assert.equal(recommendPlan({ goal: 'presence', content: 'small', updates: 'regular' }).name, 'Premium');
});

test('recommends Executive when any advanced or self-managed need is selected', () => {
  assert.equal(recommendPlan({ goal: 'advanced', content: 'small', updates: 'light' }).name, 'Executive');
  assert.equal(recommendPlan({ goal: 'presence', content: 'advanced', updates: 'light' }).name, 'Executive');
  assert.equal(recommendPlan({ goal: 'presence', content: 'small', updates: 'self' }).name, 'Executive');
});

test('renders the browser recommendation without collecting contact information', () => {
  const dom = new JSDOM(`
    <form id="planFinderForm">
      <input type="radio" name="goal" value="advanced" checked required>
      <input type="radio" name="content" value="small" checked required>
      <input type="radio" name="updates" value="light" checked required>
      <button type="submit">Recommend</button>
    </form>
    <div id="planFinderResult" hidden></div>
  `);
  const previousDocument = global.document;
  const previousFormData = global.FormData;
  global.document = dom.window.document;
  global.FormData = dom.window.FormData;

  try {
    mountPlanFinder();
    const form = dom.window.document.getElementById('planFinderForm');
    const result = dom.window.document.getElementById('planFinderResult');
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    assert.equal(result.hidden, false);
    assert.match(result.textContent, /Executive/);
    assert.match(result.textContent, /\$598/);
    assert.equal(form.querySelector('input[type="email"]'), null);
  } finally {
    global.document = previousDocument;
    global.FormData = previousFormData;
    dom.window.close();
  }
});
