// Loaded in <head> so the theme is set before the page is drawn (no flash).
(function () {
  var KEY = 'theme';

  function pickTheme(saved, prefersDark) {
    if (saved === 'dark' || saved === 'light') return saved;
    return prefersDark ? 'dark' : 'light';
  }

  function otherTheme(current) {
    return current === 'dark' ? 'light' : 'dark';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickTheme: pickTheme, otherTheme: otherTheme };
    return;
  }

  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = pickTheme(saved, prefersDark);

  function syncButton(button) {
    button.textContent = root.dataset.theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('theme-toggle');
    if (!button) return;
    syncButton(button);
    button.addEventListener('click', function () {
      root.dataset.theme = otherTheme(root.dataset.theme);
      try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) { /* storage blocked */ }
      syncButton(button);
    });
  });
})();
