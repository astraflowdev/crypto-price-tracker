// Crypto price tracker: top 10 coins by market cap from the CoinGecko public API (no key).
// Plain script (no modules) so the page also works when opened from a file.
(function (root) {
  'use strict';

  var MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets' +
    '?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h';
  var REFRESH_MS = 60000;
  var TIMEOUT_MS = 15000;

  // One batched request for all coins on the list.
  // A request that hangs is stopped, so the page never stays on "Loading" with no message.
  async function fetchTopCoins(fetchFn, timeoutMs) {
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, timeoutMs || TIMEOUT_MS);
    var res;
    try {
      res = await fetchFn(MARKETS_URL, { signal: ctrl.signal });
    } catch (err) {
      if (timedOut) throw new Error('CoinGecko did not answer in time');
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error('CoinGecko answered with status ' + res.status);
    var data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected answer from CoinGecko');
    return data;
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

  function start(doc) {
    var body = doc.getElementById('coins');
    var status = doc.getElementById('status');
    var updated = doc.getElementById('updated');

    async function refresh() {
      try {
        var coins = await fetchTopCoins(root.fetch.bind(root));
        body.innerHTML = rowsHtml(coins);
        updated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        status.textContent = '';
        status.hidden = true;
      } catch (err) {
        // Keep the last prices on the page and say what went wrong.
        status.textContent = 'Could not load prices (' + err.message + '). Trying again in 60 seconds.';
        status.hidden = false;
        if (!body.rows.length) updated.textContent = 'No prices yet.';
      }
    }

    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  var api = { MARKETS_URL: MARKETS_URL, REFRESH_MS: REFRESH_MS, TIMEOUT_MS: TIMEOUT_MS, fetchTopCoins: fetchTopCoins,
    formatPrice: formatPrice, formatChange: formatChange, rowsHtml: rowsHtml, start: start };

  // In a browser, start at once (the script is at the end of the body).
  // Do not decide this from `module`: a page or browser add-on can define it.
  if (root.document) start(root.document);
  else module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
