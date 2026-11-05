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

test('fetchTopCoins gives up with a clear error when the request hangs', async () => {
  // A request that never answers, unless it is aborted.
  const fetchFn = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  await assert.rejects(app.fetchTopCoins(fetchFn, 20), /did not answer/);
});

test('the timeout is 15 seconds by default', () => {
  assert.strictEqual(app.TIMEOUT_MS, 15000);
});

// --- Added coins (search, add, remove, save) ---

function fakeFetch(answers) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const ids = u.searchParams.get('ids');
    const data = ids ? answers.filter((c) => ids.split(',').includes(c.id)) : answers.slice(0, 10);
    return { ok: true, json: async () => data };
  };
  fn.calls = calls;
  return fn;
}

const market = Array.from({ length: 12 }, (_, i) => ({
  id: 'c' + i, symbol: 's' + i, name: 'Coin ' + i, current_price: 100 - i, price_change_percentage_24h: i,
}));

test('searchUrl uses the CoinGecko search endpoint and encodes the text', () => {
  const url = new URL(app.searchUrl('shiba inu&x'));
  assert.strictEqual(url.origin + url.pathname, 'https://api.coingecko.com/api/v3/search');
  assert.strictEqual(url.searchParams.get('query'), 'shiba inu&x');
});

test('searchCoins gives the matching coins from the search answer', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ coins: [{ id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' }] }) });
  const coins = await app.searchCoins(fetchFn, 'doge');
  assert.deepStrictEqual(coins, [{ id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' }]);
});

test('searchCoins throws when the answer has no coin list', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(app.searchCoins(fetchFn, 'doge'), /Unexpected/);
});

test('marketsUrl asks for the given ids in one request', () => {
  const url = new URL(app.marketsUrl(['bitcoin', 'dogecoin']));
  assert.strictEqual(url.pathname, '/api/v3/coins/markets');
  assert.strictEqual(url.searchParams.get('ids'), 'bitcoin,dogecoin');
  assert.strictEqual(url.searchParams.get('vs_currency'), 'usd');
});

test('fetchList with no added coins makes one top-10 request', async () => {
  const fetchFn = fakeFetch(market);
  const list = await app.fetchList(fetchFn, null, []);
  assert.strictEqual(fetchFn.calls.length, 1);
  assert.strictEqual(fetchFn.calls[0], app.MARKETS_URL);
  assert.strictEqual(list.top.length, 10);
  assert.deepStrictEqual(list.added, []);
});

test('fetchList puts the top 10 and all added coins in one request when the top 10 is known', async () => {
  const fetchFn = fakeFetch(market);
  const topIds = market.slice(0, 10).map((c) => c.id);
  const list = await app.fetchList(fetchFn, topIds, ['c11', 'c10']);
  assert.strictEqual(fetchFn.calls.length, 1);
  assert.strictEqual(new URL(fetchFn.calls[0]).searchParams.get('ids').split(',').length, 12);
  assert.deepStrictEqual(list.top.map((c) => c.id), topIds);
  assert.deepStrictEqual(list.added.map((c) => c.id), ['c11', 'c10']);
});

test('fetchList makes at most two requests when it must find the top 10, for any number of added coins', async () => {
  const fetchFn = fakeFetch(market);
  const list = await app.fetchList(fetchFn, null, ['c10', 'c11', 'c3']);
  assert.strictEqual(fetchFn.calls.length, 2);
  assert.deepStrictEqual(list.added.map((c) => c.id), ['c10', 'c11', 'c3']);
});

test('loadAdded reads saved coins and ignores bad data', () => {
  const store = (v) => ({ getItem: () => v });
  assert.deepStrictEqual(app.loadAdded(store(JSON.stringify([{ id: 'a', name: 'A', symbol: 'a' }]))), [{ id: 'a', name: 'A', symbol: 'a' }]);
  assert.deepStrictEqual(app.loadAdded(store('not json')), []);
  assert.deepStrictEqual(app.loadAdded(store(JSON.stringify({ id: 'a' }))), []);
  assert.deepStrictEqual(app.loadAdded(store(JSON.stringify([{ name: 'no id' }, 5]))), []);
  assert.deepStrictEqual(app.loadAdded(store(null)), []);
  assert.deepStrictEqual(app.loadAdded({ getItem: () => { throw new Error('blocked'); } }), []);
});

test('saveAdded writes the coins, and loadAdded reads them back', () => {
  const data = {};
  const storage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
  app.saveAdded(storage, [{ id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' }]);
  assert.deepStrictEqual(app.loadAdded(storage), [{ id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' }]);
});

test('rowsHtml with remove buttons gives one labelled button per coin', () => {
  const html = app.rowsHtml(sample, true);
  assert.strictEqual((html.match(/<button/g) || []).length, 3);
  assert.ok(html.includes('data-remove="bitcoin"'));
  assert.ok(html.includes('aria-label="Remove Bitcoin"'));
  assert.ok(!app.rowsHtml(sample).includes('<button'));
});
