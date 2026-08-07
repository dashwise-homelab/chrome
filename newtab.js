let dashwiseUrl = 'https://www.google.com';

function normalizeUrl(url) {
  if (!url) return dashwiseUrl;
  return url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url;
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

function loadFrame(url) {
  const iframe = document.getElementById('content-frame');
  let loaded = false;

  document.body.classList.remove('loaded', 'frame-failed');
  iframe.onload = () => {
    loaded = true;
    document.body.classList.add('loaded');
  };
  iframe.src = url;

  setTimeout(() => {
    if (!loaded) document.body.classList.add('frame-failed');
  }, 5000);
}

function loadDashwise() {
  chrome.storage.sync.get({ replaceNewTab: true, newTabUrl: 'https://www.google.com', newTabOpenSearch: false }, (items) => {
    if (!items.replaceNewTab) {
      document.body.classList.add('frame-failed');
      document.getElementById('fallback-message').textContent = 'Dashwise new tab replacement is disabled in extension settings.';
      return;
    }
    dashwiseUrl = normalizeUrl(items.newTabUrl);
    loadFrame(setSearchMode(dashwiseUrl, !!items.newTabOpenSearch));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashwise();
});
