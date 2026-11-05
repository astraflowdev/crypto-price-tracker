const test = require('node:test');
const assert = require('node:assert');
const theme = require('../theme.js');

test('pickTheme uses the saved choice first', () => {
  assert.strictEqual(theme.pickTheme('light', true), 'light');
  assert.strictEqual(theme.pickTheme('dark', false), 'dark');
});

test('pickTheme follows the system setting on the first visit', () => {
  assert.strictEqual(theme.pickTheme(null, true), 'dark');
  assert.strictEqual(theme.pickTheme(null, false), 'light');
});

test('pickTheme ignores a bad saved value', () => {
  assert.strictEqual(theme.pickTheme('purple', true), 'dark');
  assert.strictEqual(theme.pickTheme('', false), 'light');
});

test('otherTheme switches between dark and light', () => {
  assert.strictEqual(theme.otherTheme('dark'), 'light');
  assert.strictEqual(theme.otherTheme('light'), 'dark');
});
