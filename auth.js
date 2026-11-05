// Sign-in with Firebase Authentication (email and password), with no server of our own.
// The prices show only when a user is signed in. The config is in firebase-config.js.
// The prices are public data, so this gate is on the page only; it does not protect data.
(function (root) {
  'use strict';

  var MESSAGES = {
    'auth/invalid-credential': 'The email or password is not correct.',
    'auth/wrong-password': 'The email or password is not correct.',
    'auth/user-not-found': 'The email or password is not correct.',
    'auth/invalid-email': 'The email address is not valid.',
    'auth/email-already-in-use': 'This email already has an account. Log in instead.',
    'auth/weak-password': 'The password must have at least 6 characters.',
    'auth/missing-password': 'Enter a password.',
    'auth/user-disabled': 'This account is turned off.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
    'auth/network-request-failed': 'Could not connect to the sign-in service. Check your connection and try again.',
    'auth/operation-not-allowed': 'Email and password sign-in is not turned on in the Firebase project. See the README.',
  };

  function isConfigured(cfg) {
    return !!(cfg && cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
  }

  function errorMessage(err) {
    return MESSAGES[err && err.code] || 'Could not sign in (' + ((err && (err.code || err.message)) || 'unknown error') + ').';
  }

  function showSetup(doc, text) {
    doc.getElementById('prices').hidden = true;
    doc.getElementById('auth-section').hidden = false;
    doc.getElementById('auth-form').hidden = true;
    var setup = doc.getElementById('auth-setup');
    setup.textContent = text;
    setup.hidden = false;
  }

  // `auth` is a Firebase Auth instance (compat API). `startPrices` runs once, at the first sign-in.
  // `reload` runs when the user signs out after the prices started, to stop the refresh timer.
  function startAuth(doc, auth, startPrices, reload) {
    var section = doc.getElementById('auth-section');
    var form = doc.getElementById('auth-form');
    var message = doc.getElementById('auth-message');
    var email = doc.getElementById('email');
    var password = doc.getElementById('password');
    var logIn = doc.getElementById('log-in');
    var signUp = doc.getElementById('sign-up');
    var prices = doc.getElementById('prices');
    var userState = doc.getElementById('user-state');
    var userEmail = doc.getElementById('user-email');
    var signOut = doc.getElementById('sign-out');
    var started = false;

    function say(text) {
      message.textContent = text;
    }

    auth.onAuthStateChanged(function (user) {
      prices.hidden = !user;
      section.hidden = !!user;
      userState.hidden = !user;
      userEmail.textContent = user ? user.email : '';
      if (user) {
        say('');
        password.value = '';
        if (!started) { started = true; startPrices(); }
      } else if (started) {
        reload();
      }
    });

    async function send(create) {
      var e = email.value.trim();
      var p = password.value;
      if (!e || !p) { say('Enter an email and a password.'); return; }
      say(create ? 'Making your account…' : 'Logging in…');
      logIn.disabled = signUp.disabled = true;
      try {
        if (create) await auth.createUserWithEmailAndPassword(e, p);
        else await auth.signInWithEmailAndPassword(e, p);
      } catch (err) {
        say(errorMessage(err));
        password.focus();
      } finally {
        logIn.disabled = signUp.disabled = false;
      }
    }

    form.addEventListener('submit', function (ev) { ev.preventDefault(); return send(false); });
    signUp.addEventListener('click', function () { return send(true); });
    signOut.addEventListener('click', function () { return auth.signOut(); });
  }

  var api = { isConfigured: isConfigured, errorMessage: errorMessage, showSetup: showSetup, startAuth: startAuth };

  if (!root.document) { module.exports = api; return; }

  var doc = root.document;
  var cfg = root.FIREBASE_CONFIG;
  if (!root.firebase) {
    showSetup(doc, 'Could not load the sign-in service. Check your connection, then reload the page.');
  } else if (!isConfigured(cfg)) {
    showSetup(doc, 'Sign-in is not set up yet. Put the Firebase web app config in firebase-config.js (see the README).');
  } else {
    root.firebase.initializeApp(cfg);
    startAuth(doc, root.firebase.auth(), root.startPrices, function () { root.location.reload(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
