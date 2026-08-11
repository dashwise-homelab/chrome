const DEFAULT_DASHWISE_URL = 'https://www.google.com';
const FOCUS_RELOAD_PARAM = 'dashwise-focus';
let dashwiseUrl = DEFAULT_DASHWISE_URL;

function normalizeUrl(url) {
  if (!url) return dashwiseUrl;
  return url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url;
}

function buildPageUrl(page, baseUrl) {
  const root = normalizeUrl(baseUrl).replace(/\/+$/, '');
  return root + '/' + (page || 'home').replace(/^\/+/, '');
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

function needsFocusReload() {
  const url = new URL(window.location.href);
  if (url.searchParams.has(FOCUS_RELOAD_PARAM)) return false;

  // Chrome grants page focus only after initial new-tab navigation.
  url.searchParams.set(FOCUS_RELOAD_PARAM, '1');
  window.location.search = url.search;
  return true;
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

        window.location.replace(pageUrl);
      });
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  if (needsFocusReload()) return;
  loadDashwise();
});
