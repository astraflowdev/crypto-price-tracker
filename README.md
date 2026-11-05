# Crypto Price Tracker

A static web page (HTML and JavaScript, no backend, no build step) that shows the top 10 coins by market cap, with the USD price and the 24h change. Data comes from the free CoinGecko public API, with no key.

When CoinGecko fails (a rate limit or a network error), the page keeps the last prices and shows a short message that they may be out of date. It waits longer before each new try (60 s, then 120 s, 240 s, up to 10 minutes). It also gets new prices for the coins on the page from the Binance public API (`/api/v3/ticker/price`, no key) where Binance lists the coin against USDT. The message goes away when CoinGecko prices load again.

A button at the top switches between dark and light themes, with a 300 ms fade. The page saves the choice in local storage. On the first visit it follows the system setting (`prefers-color-scheme`).

## Run

- Open `index.html` in a browser, or
- Run `npm start` (it serves the folder on the `PORT` setting, default 8000).

## Test

`npm test` (Node.js 22 or newer, no dependencies).
