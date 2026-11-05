const test = require('node:test');
const assert = require('node:assert');
const app = require('../app.js');

const sample = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 76406.12, price_change_percentage_24h: -2.345 },
  { id: 'tether', symbol: 'usdt', name: 'Tether', current_price: 1, price_change_percentage_24h: 0.01 },
  { id: 'x', symbol: 'x', name: '<b>X</b>', current_price: 0.000123, price_change_percentage_24h: null },
];

test('URL asks for the top 10 by market cap in USD, with no key', () => {
  const url = new URL(app.MARKETS_URL);
  assert.strictEqual(url.origin + url.pathname, 'https://api.coingecko.com/api/v3/coins/markets');
  assert.strictEqual(url.searchParams.get('vs_currency'), 'usd');
  assert.strictEqual(url.searchParams.get('order'), 'market_cap_desc');
  assert.strictEqual(url.searchParams.get('per_page'), '10');
  assert.ok(!/key/i.test(app.MARKETS_URL));
});

test('refresh is 60 seconds', () => {
  assert.strictEqual(app.REFRESH_MS, 60000);
});

test('fetchTopCoins makes exactly one request', async () => {
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return { ok: true, json: async () => sample }; };
  const coins = await app.fetchTopCoins(fetchFn);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], app.MARKETS_URL);
  assert.strictEqual(coins.length, 3);
});

test('fetchTopCoins throws on a bad HTTP status', async () => {
  const fetchFn = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(app.fetchTopCoins(fetchFn), /429/);
});

test('fetchTopCoins throws when the answer is not a list', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ status: { error_code: 429 } }) });
  await assert.rejects(app.fetchTopCoins(fetchFn), /Unexpected/);
});

test('formatPrice formats USD, with more digits for small prices', () => {
  assert.strictEqual(app.formatPrice(76406.12), '$76,406.12');
  assert.strictEqual(app.formatPrice(1), '$1.00');
  assert.strictEqual(app.formatPrice(0.000123), '$0.000123');
  assert.strictEqual(app.formatPrice(null), '–');
});

test('formatChange shows sign and two decimals', () => {
  assert.strictEqual(app.formatChange(-2.345), '-2.35%');
  assert.strictEqual(app.formatChange(0.01), '+0.01%');
  assert.strictEqual(app.formatChange(null), '–');
});

test('rowsHtml gives one row per coin, escapes names and marks up/down', () => {
  const html = app.rowsHtml(sample);
  assert.strictEqual((html.match(/<tr/g) || []).length, 3);
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(!html.includes('<b>X</b>'));
  assert.ok(html.includes('class="change down"'));
  assert.ok(html.includes('class="change up"'));
  assert.ok(html.includes('BTC'));
});
