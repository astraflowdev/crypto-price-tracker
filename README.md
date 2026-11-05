# Crypto Price Tracker

A static web page (HTML and JavaScript, no backend, no build step) that shows the top 10 coins by market cap, with the USD price and the 24h change. A search box finds other coins to add to the list; they are saved in the browser (local storage) and can be removed. Each refresh gets all coins in one batched request (two when the page finds the top 10 again, about every 10 minutes). Data comes from the free CoinGecko public API, with no key.

When CoinGecko fails (a rate limit or a network error), the page keeps the last prices and shows a short message that they may be out of date. It waits longer before each new try (60 s, then 120 s, 240 s, up to 10 minutes). It also gets new prices for the coins on the page from the Binance public API (`/api/v3/ticker/price`, no key) where Binance lists the coin against USDT. The message goes away when CoinGecko prices load again.

A button at the top switches between dark and light themes, with a 300 ms fade. The page saves the choice in local storage. On the first visit it follows the system setting (`prefers-color-scheme`).

## Log in

The prices show only after you log in. You can sign up, log in and log out with an email and a password. The header shows the email of the user who is signed in.

Sign-in uses [Firebase Authentication](https://firebase.google.com/docs/auth) from the browser, so there is still no server of our own. We use Firebase because:

- Its free Spark plan needs no payment card.
- It works from a static page: the page loads the Firebase script from Google's CDN, with no build step.
- Email and password sign-in works at once, with no email confirmation step and no email server to set up.

(Supabase Auth is also free with no card, but it asks new users to confirm their email by default, and it pauses a free project after a week with no use.)

The login gate is on the page only. The prices are public data from public APIs, so the gate does not protect data. Your coins are saved in this browser, not with your account. A personal watchlist saved with the account is a possible next step.

### Set up Firebase (one time)

1. Go to the [Firebase console](https://console.firebase.google.com/) and sign in with a Google account.
2. Click **Create a project** (or **Add project**). Give it a name. Google Analytics is not necessary.
3. In the project, go to **Build > Authentication**, click **Get started**, open the **Sign-in method** tab, and turn on **Email/Password**. Save.
4. Go to **Project settings** (the gear icon) **> General > Your apps**, and click the web icon (`</>`). Give the app a name. Firebase Hosting is not necessary.
5. Firebase shows a `firebaseConfig` object. Copy the `apiKey`, `authDomain`, `projectId` and `appId` values into `firebase-config.js`.
6. Commit `firebase-config.js` and deploy the page.

The values in `firebase-config.js` are public client keys: every visitor's browser gets them. They are not secrets. Never put a service account key or any other secret in this repository. If you want, you can limit the API key to your site's address in the Google Cloud console (**APIs & Services > Credentials**).

Until `firebase-config.js` has these values, the page shows "Sign-in is not set up yet" and no prices.

## Run

Run `npm start` (it serves the folder on the `PORT` setting, default 8000), then open the address in a browser. Sign-in needs an `http` or `https` address, so opening `index.html` as a file is not supported.

## Test

`npm test` (Node.js 22 or newer, no dependencies).
