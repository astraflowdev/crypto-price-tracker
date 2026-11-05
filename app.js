// Crypto price tracker: top 10 coins by market cap from the CoinGecko public API (no key).
// When CoinGecko fails, prices come from the Binance public market data API (no key).
// Plain script (no modules) so the page also works when opened from a file.
(function (root) {
  'use strict';

  var MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets' +
    '?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h';
  // Binance's host for public market data only (same /api/v3 endpoints as api.binance.com).
  var BINANCE_URL = 'https://data-api.binance.vision/api/v3/ticker/price';
  var REFRESH_MS = 60000;
  var MAX_WAIT_MS = 600000;
  var TIMEOUT_MS = 15000;

  // One GET that gives a JSON list. A request that hangs is stopped,
  // so the page never stays on "Loading" with no message.
  async function getList(fetchFn, url, name, timeoutMs) {
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, timeoutMs || TIMEOUT_MS);
    var res;
    try {
      res = await fetchFn(url, { signal: ctrl.signal });
    } catch (err) {
      if (timedOut) throw new Error(name + ' did not answer in time');
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      var httpErr = new Error(name + ' answered with status ' + res.status);
      httpErr.status = res.status;
      throw httpErr;
    }
    var data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected answer from ' + name);
    return data;
  }

  // One batched request for all coins on the list.
  function fetchTopCoins(fetchFn, timeoutMs) {
    return getList(fetchFn, MARKETS_URL, 'CoinGecko', timeoutMs);
  }

  // Wait after `failures` errors in a row: 60 s, then double each time, up to 10 minutes.
  function nextDelay(failures) {
    return Math.min(REFRESH_MS * Math.pow(2, failures), MAX_WAIT_MS);
  }

  // New prices for the last known coins, from Binance <SYMBOL>USDT pairs.
  // A coin that Binance does not list keeps its last known price. The 24h change stays as last known.
  async function fetchBinancePrices(fetchFn, lastCoins) {
    var tickers = await getList(fetchFn, BINANCE_URL, 'Binance');
    var prices = {};
    tickers.forEach(function (t) { prices[t.symbol] = parseFloat(t.price); });
    var found = 0;
    var coins = lastCoins.map(function (c) {
      var p = prices[String(c.symbol).toUpperCase() + 'USDT'];
      if (!(p > 0)) return c;
      found++;
      return Object.assign({}, c, { current_price: p });
    });
    if (!found) throw new Error('Binance does not list these coins');
    return coins;
  }

  // CoinGecko first. When it fails (a rate limit, or it cannot be reached), try Binance for the
  // coins already on the page. In the browser a CoinGecko 429 can look like a network error,
  // so any CoinGecko failure starts the fallback. If Binance also fails, the CoinGecko error is thrown.
  async function loadPrices(fetchFn, lastCoins) {
    try {
      return { source: 'coingecko', coins: await fetchTopCoins(fetchFn) };
    } catch (err) {
      if (!lastCoins.length) throw err;
      try {
        return { source: 'binance', coins: await fetchBinancePrices(fetchFn, lastCoins), error: err };
      } catch (e) {
        throw err;
      }
    }
  }

  function formatPrice(n) {
    if (typeof n !== 'number') return '–';
    var digits = n >= 1 ? 2 : 6;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits });
  }

  function formatChange(n) {
    if (typeof n !== 'number') return '–';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rowsHtml(coins) {
    return coins.map(function (c, i) {
      var ch = c.price_change_percentage_24h;
      var dir = typeof ch !== 'number' ? '' : ch >= 0 ? ' up' : ' down';
      return '<tr>' +
        '<td class="rank">' + (i + 1) + '</td>' +
        '<td class="name">' + escapeHtml(c.name) + ' <span class="symbol">' + escapeHtml(String(c.symbol).toUpperCase()) + '</span></td>' +
        '<td class="price">' + formatPrice(c.current_price) + '</td>' +
        '<td class="change' + dir + '">' + formatChange(ch) + '</td>' +
        '</tr>';
    }).join('');
  }

  function start(doc, fetchFn, later) {
    var body = doc.getElementById('coins');
    var status = doc.getElementById('status');
    var updated = doc.getElementById('updated');
    var lastCoins = [];
    var failures = 0;

    async function refresh() {
      try {
        var r = await loadPrices(fetchFn, lastCoins);
        lastCoins = r.coins;
        body.innerHTML = rowsHtml(r.coins);
        updated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        if (r.source === 'coingecko') {
          failures = 0;
          status.textContent = '';
          status.hidden = true;
        } else {
          failures++;
          status.textContent = 'CoinGecko is not available (' + r.error.message + '). Prices are from Binance; ' +
            'the 24h change and coins not on Binance may be out of date. Trying CoinGecko again in ' +
            nextDelay(failures) / 1000 + ' seconds.';
          status.hidden = false;
        }
      } catch (err) {
        // Keep the last prices on the page, say what went wrong, and wait longer before the next try.
        failures++;
        status.textContent = 'Could not load new prices (' + err.message + '). ' +
          (body.rows.length ? 'Prices may be out of date. ' : '') +
          'Trying again in ' + nextDelay(failures) / 1000 + ' seconds.';
        status.hidden = false;
        if (!body.rows.length) updated.textContent = 'No prices yet.';
      }
      later(refresh, nextDelay(failures));
    }

    return refresh();
  }

  var api = { MARKETS_URL: MARKETS_URL, BINANCE_URL: BINANCE_URL, REFRESH_MS: REFRESH_MS, TIMEOUT_MS: TIMEOUT_MS,
    fetchTopCoins: fetchTopCoins, nextDelay: nextDelay, loadPrices: loadPrices, formatPrice: formatPrice, formatChange: formatChange, rowsHtml: rowsHtml, start: start };

  // In a browser, start at once (the script is at the end of the body).
  // Do not decide this from `module`: a page or browser add-on can define it.
  if (root.document) start(root.document, root.fetch.bind(root), root.setTimeout.bind(root));
  else module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
