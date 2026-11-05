# Crypto Price Tracker

A static web page (HTML and JavaScript, no backend, no build step) that shows the top 10 coins by market cap, with the USD price and the 24h change. A search box finds other coins to add to the list; they are saved in the browser (local storage) and can be removed. Each refresh gets all coins in one batched request (two when the page finds the top 10 again, about every 10 minutes). Data comes from the free CoinGecko public API, with no key.

## Run

- Open `index.html` in a browser, or
- Run `npm start` (it serves the folder on the `PORT` setting, default 8000).

## Test

`npm test` (Node.js 22 or newer, no dependencies).
