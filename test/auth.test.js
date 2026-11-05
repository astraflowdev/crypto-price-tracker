const test = require('node:test');
const assert = require('node:assert');
const auth = require('../auth.js');

test('isConfigured needs the apiKey, authDomain, projectId and appId', () => {
  assert.strictEqual(auth.isConfigured(undefined), false);
  assert.strictEqual(auth.isConfigured({ apiKey: '', authDomain: '', projectId: '', appId: '' }), false);
  assert.strictEqual(auth.isConfigured({ apiKey: 'k', authDomain: 'd', projectId: 'p', appId: '' }), false);
  assert.strictEqual(auth.isConfigured({ apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' }), true);
});

test('errorMessage gives plain words for known codes and a general message for others', () => {
  assert.match(auth.errorMessage({ code: 'auth/invalid-credential' }), /email or password is not correct/);
  assert.match(auth.errorMessage({ code: 'auth/email-already-in-use' }), /already has an account/);
  assert.match(auth.errorMessage({ code: 'auth/weak-password' }), /6 characters/);
  assert.match(auth.errorMessage({ code: 'auth/something-new', message: 'x' }), /Could not sign in/);
});

// A tiny fake page and a fake Firebase Auth, so startAuth() can run in Node.
function fakePage() {
  const el = () => {
    const handlers = {};
    return { textContent: '', hidden: true, value: '', disabled: false, handlers,
      addEventListener(type, fn) { handlers[type] = fn; }, focus() {} };
  };
  const els = { 'auth-section': el(), 'auth-form': el(), 'auth-setup': el(), 'auth-message': el(),
    email: el(), password: el(), 'sign-up': el(), prices: el(), 'user-state': el(), 'user-email': el(),
    'sign-out': el() };
  return { els, doc: { getElementById: (id) => els[id] } };
}

function fakeAuth() {
  const calls = [];
  const a = {
    calls, listener: null, fail: null,
    onAuthStateChanged(fn) { a.listener = fn; },
    async signInWithEmailAndPassword(email, password) {
      calls.push(['in', email, password]);
      if (a.fail) throw a.fail;
      a.listener({ email });
    },
    async createUserWithEmailAndPassword(email, password) {
      calls.push(['up', email, password]);
      if (a.fail) throw a.fail;
      a.listener({ email });
    },
    async signOut() { calls.push(['out']); a.listener(null); },
  };
  return a;
}

const submit = { preventDefault() {} };

test('signed out: the prices are hidden and do not load', () => {
  const { els, doc } = fakePage();
  const a = fakeAuth();
  let started = 0;
  auth.startAuth(doc, a, () => { started++; }, () => {});
  a.listener(null);
  assert.strictEqual(els.prices.hidden, true);
  assert.strictEqual(els['auth-section'].hidden, false);
  assert.strictEqual(els['user-state'].hidden, true);
  assert.strictEqual(started, 0);
});

test('log in shows the prices, the email in the header, and starts prices once', async () => {
  const { els, doc } = fakePage();
  const a = fakeAuth();
  let started = 0;
  auth.startAuth(doc, a, () => { started++; }, () => {});
  a.listener(null);
  els.email.value = ' me@example.com ';
  els.password.value = 'secret1';
  await els['auth-form'].handlers.submit(submit);
  assert.deepStrictEqual(a.calls[0], ['in', 'me@example.com', 'secret1']);
  assert.strictEqual(els.prices.hidden, false);
  assert.strictEqual(els['auth-section'].hidden, true);
  assert.strictEqual(els['user-state'].hidden, false);
  assert.strictEqual(els['user-email'].textContent, 'me@example.com');
  assert.strictEqual(els.password.value, '');
  a.listener({ email: 'me@example.com' }); // Firebase can tell the same state again.
  assert.strictEqual(started, 1);
});

test('sign up makes an account with the email and password', async () => {
  const { els, doc } = fakePage();
  const a = fakeAuth();
  auth.startAuth(doc, a, () => {}, () => {});
  a.listener(null);
  els.email.value = 'new@example.com';
  els.password.value = 'secret1';
  await els['sign-up'].handlers.click();
  assert.deepStrictEqual(a.calls[0], ['up', 'new@example.com', 'secret1']);
  assert.strictEqual(els.prices.hidden, false);
});

test('a failed log in shows a message and keeps the prices hidden', async () => {
  const { els, doc } = fakePage();
  const a = fakeAuth();
  auth.startAuth(doc, a, () => { throw new Error('must not start'); }, () => {});
  a.listener(null);
  a.fail = { code: 'auth/invalid-credential' };
  els.email.value = 'me@example.com';
  els.password.value = 'wrong';
  await els['auth-form'].handlers.submit(submit);
  assert.match(els['auth-message'].textContent, /not correct/);
  assert.strictEqual(els['auth-message'].hidden, false);
  assert.strictEqual(els.prices.hidden, true);
  assert.strictEqual(els['sign-up'].disabled, false);
});

test('an empty email or password does not call Firebase', async () => {
  const { els, doc } = fakePage();
  const a = fakeAuth();
  auth.startAuth(doc, a, () => {}, () => {});
  a.listener(null);
  await els['auth-form'].handlers.submit(submit);
  assert.strictEqual(a.calls.length, 0);
  assert.match(els['auth-message'].textContent, /email and a password/);
});

test('log out after the prices started reloads the page, so no refresh keeps running', async () => {
  const { els, doc } = fakePage();
  const a = fakeAuth();
  let reloads = 0;
  auth.startAuth(doc, a, () => {}, () => { reloads++; });
  a.listener({ email: 'me@example.com' });
  await els['sign-out'].handlers.click();
  assert.deepStrictEqual(a.calls, [['out']]);
  assert.strictEqual(els.prices.hidden, true);
  assert.strictEqual(reloads, 1);
});

test('showSetup hides the form and the prices and says how to set up sign-in', () => {
  const { els, doc } = fakePage();
  auth.showSetup(doc, 'Sign-in is not set up yet.');
  assert.strictEqual(els['auth-section'].hidden, false);
  assert.strictEqual(els['auth-form'].hidden, true);
  assert.strictEqual(els['auth-setup'].hidden, false);
  assert.match(els['auth-setup'].textContent, /not set up/);
  assert.strictEqual(els.prices.hidden, true);
});
