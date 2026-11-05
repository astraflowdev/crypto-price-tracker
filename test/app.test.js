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

// Back-off, fallback and recovery.

const binanceTickers = [
  { symbol: 'BTCUSDT', price: '70000.50000000' },
  { symbol: 'ETHUSDT', price: '3000.10000000' },
];

test('nextDelay is 60 seconds after success and doubles after each error, up to 10 minutes', () => {
  assert.strictEqual(app.nextDelay(0), 60000);
  assert.strictEqual(app.nextDelay(1), 120000);
  assert.strictEqual(app.nextDelay(2), 240000);
  assert.strictEqual(app.nextDelay(3), 480000);
  assert.strictEqual(app.nextDelay(4), 600000);
  assert.strictEqual(app.nextDelay(50), 600000);
});

test('the Binance URL is the public ticker price endpoint, with no key', () => {
  const url = new URL(app.BINANCE_URL);
  assert.strictEqual(url.pathname, '/api/v3/ticker/price');
  assert.ok(!/key/i.test(app.BINANCE_URL));
});

test('fetchTopCoins error keeps the HTTP status', async () => {
  const fetchFn = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(app.fetchTopCoins(fetchFn), (err) => err.status === 429);
});

test('loadPrices uses CoinGecko when it answers, and does not call Binance', async () => {
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return { ok: true, json: async () => sample }; };
  const r = await app.loadPrices(fetchFn, { coins: [], added: [] });
  assert.strictEqual(r.source, 'coingecko');
  assert.strictEqual(r.coins.length, 3);
  assert.deepStrictEqual(calls, [app.MARKETS_URL]);
});

test('loadPrices takes prices from Binance when CoinGecko is rate-limited', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url === app.MARKETS_URL) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, json: async () => binanceTickers };
  };
  const r = await app.loadPrices(fetchFn, { coins: sample, added: [] });
  assert.strictEqual(r.source, 'binance');
  assert.match(r.error.message, /429/);
  assert.deepStrictEqual(calls, [app.MARKETS_URL, app.BINANCE_URL]);
  // Bitcoin is listed on Binance: new price, last known 24h change.
  assert.strictEqual(r.coins[0].current_price, 70000.5);
  assert.strictEqual(r.coins[0].price_change_percentage_24h, -2.345);
  // Tether and X are not listed as <SYMBOL>USDT: the last known price stays.
  assert.strictEqual(r.coins[1].current_price, 1);
  assert.strictEqual(r.coins[2].current_price, 0.000123);
  // The last known list is not changed.
  assert.strictEqual(sample[0].current_price, 76406.12);
});

test('loadPrices also tries Binance when CoinGecko cannot be reached', async () => {
  const fetchFn = async (url) => {
    if (url === app.MARKETS_URL) throw new TypeError('Failed to fetch');
    return { ok: true, json: async () => binanceTickers };
  };
  const r = await app.loadPrices(fetchFn, { coins: sample, added: [] });
  assert.strictEqual(r.source, 'binance');
});

test('loadPrices throws the CoinGecko error when Binance also fails', async () => {
  const fetchFn = async (url) => {
    if (url === app.MARKETS_URL) return { ok: false, status: 429, json: async () => ({}) };
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(app.loadPrices(fetchFn, { coins: sample, added: [] }), /429/);
});

test('loadPrices throws the CoinGecko error when there are no last known coins', async () => {
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return { ok: false, status: 429, json: async () => ({}) }; };
  await assert.rejects(app.loadPrices(fetchFn, { coins: [], added: [] }), /429/);
  assert.deepStrictEqual(calls, [app.MARKETS_URL]);
});

test('loadPrices throws when Binance has none of the coins', async () => {
  const fetchFn = async (url) => {
    if (url === app.MARKETS_URL) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, json: async () => [{ symbol: 'ZZZUSDT', price: '1' }] };
  };
  await assert.rejects(app.loadPrices(fetchFn, { coins: sample, added: [] }), /429/);
});

// A tiny fake page, so start() can run in Node.
function fakePage() {
  const el = () => ({ textContent: '', hidden: true, innerHTML: '', rows: [] });
  const input = () => Object.assign(el(), { value: '', addEventListener() {}, focus() {} });
  const els = { coins: el(), status: el(), updated: el(), 'added-section': el(), added: input(),
    search: input(), results: input(), 'search-status': el() };
  Object.defineProperty(els.coins, 'rows', { get() { return (this.innerHTML.match(/<tr/g) || []); } });
  return { els, doc: { getElementById: (id) => els[id] } };
}

test('start keeps the last prices, shows an out-of-date message, waits longer, and clears the message on recovery', async () => {
  const { els, doc } = fakePage();
  const waits = [];
  let next;
  const timer = (fn, ms) => { waits.push(ms); next = fn; };
  let mode = 'ok';
  const fetchFn = async (url) => {
    if (mode === 'ok') return { ok: true, json: async () => sample };
    throw new TypeError('Failed to fetch');
  };
  await app.start(doc, fetchFn, timer);
  assert.strictEqual(els.status.hidden, true);
  const rows = els.coins.innerHTML;
  assert.ok(rows.includes('Bitcoin'));
  assert.deepStrictEqual(waits, [60000]);

  mode = 'down';
  await next();
  assert.strictEqual(els.coins.innerHTML, rows);
  assert.strictEqual(els.status.hidden, false);
  assert.match(els.status.textContent, /out of date/);
  assert.match(els.status.textContent, /120 seconds/);
  await next();
  assert.match(els.status.textContent, /240 seconds/);
  assert.deepStrictEqual(waits, [60000, 120000, 240000]);

  mode = 'ok';
  await next();
  assert.strictEqual(els.status.hidden, true);
  assert.strictEqual(els.status.textContent, '');
  assert.deepStrictEqual(waits, [60000, 120000, 240000, 60000]);
});

test('start shows Binance prices with a message when CoinGecko is rate-limited', async () => {
  const { els, doc } = fakePage();
  const waits = [];
  let next;
  const timer = (fn, ms) => { waits.push(ms); next = fn; };
  let limited = false;
  const fetchFn = async (url) => {
    if (url.includes('coingecko')) {
      return limited ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, json: async () => sample };
    }
    return { ok: true, json: async () => binanceTickers };
  };
  await app.start(doc, fetchFn, timer);
  limited = true;
  await next();
  assert.ok(els.coins.innerHTML.includes('$70,000.50'));
  assert.strictEqual(els.status.hidden, false);
  assert.match(els.status.textContent, /Binance/);
  assert.deepStrictEqual(waits, [60000, 120000]);
});

test('loadPrices gives Binance prices for the added coins too, in the same Binance request', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('coingecko')) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, json: async () => binanceTickers.concat([{ symbol: 'DOGEUSDT', price: '0.08' }]) };
  };
  const doge = { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', current_price: 0.07, price_change_percentage_24h: -5 };
  const r = await app.loadPrices(fetchFn, { coins: sample, added: [doge] }, ['bitcoin'], ['dogecoin']);
  assert.strictEqual(r.source, 'binance');
  assert.strictEqual(r.coins.length, sample.length);
  assert.deepStrictEqual(r.added.map((c) => c.current_price), [0.08]);
  assert.strictEqual(calls.filter((u) => u === app.BINANCE_URL).length, 1);
});
