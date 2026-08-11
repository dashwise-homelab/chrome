const DEFAULT_DASHWISE_URL = 'https://www.google.com';
let dashwiseUrl = DEFAULT_DASHWISE_URL;

function normalizeUrl(url) {
  if (!url) return dashwiseUrl;
  return url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url;
}

function buildPageUrl(page, baseUrl) {
  const root = normalizeUrl(baseUrl).replace(/\/+$/, '');
  return page && page !== 'home'
    ? root + '/' + page.replace(/^\/+/, '')
    : root;
}

function setSearchMode(url, enabled) {
  const parsed = new URL(url);
  if (enabled) {
    parsed.searchParams.set('search', '1');
  } else {
    parsed.searchParams.delete('search');
  }
  return parsed.toString();
}

function isDashboardUrl(url, baseUrl) {
  const target = new URL(url);
  const dashboard = new URL(normalizeUrl(baseUrl));
  return target.origin === dashboard.origin && target.pathname === dashboard.pathname;
}

function focusNewTab() {
  window.focus();
  document.body.focus();
}

function loadFrame(url) {
  const iframe = document.getElementById('content-frame');
  let loaded = false;

  document.body.classList.remove('loaded', 'frame-failed');
  iframe.onload = () => {
    loaded = true;
    document.body.classList.add('loaded');
    focusNewTab();
  };
  iframe.src = url;

  setTimeout(() => {
    if (!loaded) document.body.classList.add('frame-failed');
  }, 5000);
}

function loadDashwise() {
  chrome.storage.sync.get(
    { replaceNewTab: true, newTabPage: 'home', newTabUrl: DEFAULT_DASHWISE_URL, newTabOpenSearch: false },
    (items) => {
      if (!items.replaceNewTab) {
        document.body.classList.add('frame-failed');
        document.getElementById('fallback-message').textContent = 'Dashwise new tab replacement is disabled in extension settings.';
        return;
      }

      chrome.storage.local.get({ dashwiseBaseUrl: '' }, (auth) => {
        // newTabUrl keeps older saved settings working until they are saved again.
        dashwiseUrl = normalizeUrl(auth.dashwiseBaseUrl || items.newTabUrl);
        const pageUrl = setSearchMode(
          buildPageUrl(items.newTabPage, dashwiseUrl),
          !!items.newTabOpenSearch
        );

        focusNewTab();
        if (!isDashboardUrl(pageUrl, dashwiseUrl)) {
          window.location.replace(pageUrl);
          return;
        }

        loadFrame(pageUrl);
      });
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashwise();
});
