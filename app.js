// Crypto price tracker: top 10 coins by market cap from the CoinGecko public API (no key),
// plus coins that the user adds with the search box (saved in local storage).
// Plain script (no modules) so the page also works when opened from a file.
(function (root) {
  'use strict';

  var API = 'https://api.coingecko.com/api/v3';
  var MARKETS_URL = API + '/coins/markets' +
    '?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h';
  var REFRESH_MS = 60000;
  var TIMEOUT_MS = 15000;
  var STORAGE_KEY = 'addedCoins';
  // Find the top 10 again on every 10th refresh (about every 10 minutes).
  // The other refreshes get the top 10 and the added coins in one request.
  var TOP_CHECK_EVERY = 10;
  var SEARCH_DELAY_MS = 400;
  var SEARCH_MAX = 8;

  function marketsUrl(ids) {
    return API + '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1' +
      '&price_change_percentage=24h&ids=' + ids.map(encodeURIComponent).join(',');
  }

  function searchUrl(query) {
    return API + '/search?query=' + encodeURIComponent(query);
  }

  // A request that hangs is stopped, so the page never stays on "Loading" with no message.
  async function fetchJson(fetchFn, url, timeoutMs) {
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, timeoutMs || TIMEOUT_MS);
    var res;
    try {
      res = await fetchFn(url, { signal: ctrl.signal });
    } catch (err) {
      if (timedOut) throw new Error('CoinGecko did not answer in time');
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error('CoinGecko answered with status ' + res.status);
    return res.json();
  }

  async function fetchMarkets(fetchFn, url, timeoutMs) {
    var data = await fetchJson(fetchFn, url, timeoutMs);
    if (!Array.isArray(data)) throw new Error('Unexpected answer from CoinGecko');
    return data;
  }

  function fetchTopCoins(fetchFn, timeoutMs) {
    return fetchMarkets(fetchFn, MARKETS_URL, timeoutMs);
  }

  async function searchCoins(fetchFn, query) {
    var data = await fetchJson(fetchFn, searchUrl(query));
    if (!data || !Array.isArray(data.coins)) throw new Error('Unexpected answer from CoinGecko');
    return data.coins.slice(0, SEARCH_MAX).map(function (c) {
      return { id: c.id, name: c.name, symbol: c.symbol };
    });
  }

  // Gets the top 10 and the added coins with as few requests as possible:
  // one request when the top 10 ids are known, else one for the top 10 and one for all added coins.
  // Never one request per coin.
  async function fetchList(fetchFn, topIds, addedIds) {
    var top, all;
    if (topIds && topIds.length) {
      var ids = topIds.concat(addedIds.filter(function (id) { return topIds.indexOf(id) < 0; }));
      all = await fetchMarkets(fetchFn, marketsUrl(ids));
      top = all.filter(function (c) { return topIds.indexOf(c.id) >= 0; });
    } else {
      top = await fetchTopCoins(fetchFn);
      all = top;
      var missing = addedIds.filter(function (id) { return !top.some(function (c) { return c.id === id; }); });
      if (missing.length) all = top.concat(await fetchMarkets(fetchFn, marketsUrl(missing)));
    }
    var added = addedIds.map(function (id) {
      return all.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    return { top: top, added: added };
  }

  function loadAdded(storage) {
    try {
      var list = JSON.parse(storage.getItem(STORAGE_KEY));
      if (!Array.isArray(list)) return [];
      return list.filter(function (c) {
        return c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.symbol === 'string';
      });
    } catch (err) {
      return [];
    }
  }

  function saveAdded(storage, list) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      // Storage can be full or blocked; the list still works until the page is reloaded.
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

  // Added coins (removable) show their market cap rank, the top 10 show their place.
  function rowsHtml(coins, removable) {
    return coins.map(function (c, i) {
      var ch = c.price_change_percentage_24h;
      var dir = typeof ch !== 'number' ? '' : ch >= 0 ? ' up' : ' down';
      var rank = removable ? (typeof c.market_cap_rank === 'number' ? c.market_cap_rank : '–') : i + 1;
      return '<tr>' +
        '<td class="rank">' + rank + '</td>' +
        '<td class="name">' + escapeHtml(c.name) + ' <span class="symbol">' + escapeHtml(String(c.symbol).toUpperCase()) + '</span></td>' +
        '<td class="price">' + formatPrice(c.current_price) + '</td>' +
        '<td class="change' + dir + '">' + formatChange(ch) + '</td>' +
        (removable ? '<td class="remove"><button type="button" data-remove="' + escapeHtml(c.id) +
          '" aria-label="Remove ' + escapeHtml(c.name) + '">Remove</button></td>' : '') +
        '</tr>';
    }).join('');
  }

  function start(doc) {
    var body = doc.getElementById('coins');
    var status = doc.getElementById('status');
    var updated = doc.getElementById('updated');
    var addedSection = doc.getElementById('added-section');
    var addedBody = doc.getElementById('added');
    var searchInput = doc.getElementById('search');
    var results = doc.getElementById('results');
    var searchStatus = doc.getElementById('search-status');
    var fetchFn = root.fetch.bind(root);
    var storage = null;
    try { storage = root.localStorage; } catch (err) { /* Blocked storage: the list works until a reload. */ }

    var added = loadAdded(storage);
    var topIds = null;
    var refreshCount = 0;
    var latest = 0;
    var lastPrices = {};
    var topShown = [];

    function renderAdded() {
      addedSection.hidden = !added.length;
      // A coin with no price yet shows its saved name and "–".
      addedBody.innerHTML = rowsHtml(added.map(function (c) { return lastPrices[c.id] || c; }), true);
    }

    async function refresh() {
      var mine = ++latest;
      var checkTop = refreshCount++ % TOP_CHECK_EVERY === 0;
      try {
        var list = await fetchList(fetchFn, checkTop ? null : topIds, added.map(function (c) { return c.id; }));
        if (mine !== latest) return; // A newer refresh started; let it draw the page.
        topIds = list.top.map(function (c) { return c.id; });
        topShown = list.top;
        list.added.forEach(function (c) { lastPrices[c.id] = c; });
        body.innerHTML = rowsHtml(list.top);
        renderAdded();
        updated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        status.textContent = '';
        status.hidden = true;
      } catch (err) {
        if (mine !== latest) return;
        // Keep the last prices on the page and say what went wrong.
        status.textContent = 'Could not load prices (' + err.message + '). Trying again in 60 seconds.';
        status.hidden = false;
        if (!body.rows.length) updated.textContent = 'No prices yet.';
      }
    }

    function addCoin(coin) {
      if (added.some(function (c) { return c.id === coin.id; })) {
        searchStatus.textContent = coin.name + ' is already in your coins.';
        return;
      }
      if (topShown.some(function (c) { return c.id === coin.id; })) {
        searchStatus.textContent = coin.name + ' is already in the top 10.';
        return;
      }
      added.push(coin);
      saveAdded(storage, added);
      renderAdded();
      searchStatus.textContent = coin.name + ' is added.';
      refresh();
    }

    addedBody.addEventListener('click', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-remove');
      if (!id) return;
      var coin = added.filter(function (c) { return c.id === id; })[0];
      added = added.filter(function (c) { return c.id !== id; });
      delete lastPrices[id];
      saveAdded(storage, added);
      renderAdded();
      if (coin) searchStatus.textContent = coin.name + ' is removed.';
      searchInput.focus();
    });

    var found = [];
    var searchTimer = null;
    var searchSeq = 0;

    results.addEventListener('click', function (e) {
      var i = e.target.getAttribute && e.target.getAttribute('data-add');
      if (i === null || !found[i]) return;
      addCoin(found[i]);
    });

    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var query = searchInput.value.trim();
      if (query.length < 2) {
        results.innerHTML = '';
        searchStatus.textContent = '';
        return;
      }
      // Wait until the user stops typing, to keep the number of requests low.
      searchTimer = setTimeout(async function () {
        var mine = ++searchSeq;
        searchStatus.textContent = 'Searching…';
        try {
          var coins = await searchCoins(fetchFn, query);
          if (mine !== searchSeq) return;
          found = coins;
          results.innerHTML = coins.map(function (c, i) {
            return '<li><button type="button" data-add="' + i + '">Add ' + escapeHtml(c.name) +
              ' <span class="symbol">' + escapeHtml(String(c.symbol).toUpperCase()) + '</span></button></li>';
          }).join('');
          searchStatus.textContent = coins.length ? coins.length + ' coins found.' : 'No coins found.';
        } catch (err) {
          if (mine !== searchSeq) return;
          results.innerHTML = '';
          searchStatus.textContent = 'Could not search (' + err.message + '). Try again in a moment.';
        }
      }, SEARCH_DELAY_MS);
    });

    renderAdded();
    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  var api = { MARKETS_URL: MARKETS_URL, REFRESH_MS: REFRESH_MS, TIMEOUT_MS: TIMEOUT_MS, fetchTopCoins: fetchTopCoins,
    marketsUrl: marketsUrl, searchUrl: searchUrl, searchCoins: searchCoins, fetchList: fetchList,
    loadAdded: loadAdded, saveAdded: saveAdded,
    formatPrice: formatPrice, formatChange: formatChange, rowsHtml: rowsHtml, start: start };

  // In a browser, start at once (the script is at the end of the body).
  // Do not decide this from `module`: a page or browser add-on can define it.
  if (root.document) start(root.document);
  else module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
