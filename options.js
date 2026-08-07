(function () {
  function buildPageUrl(page, baseUrl) {
    const root = (baseUrl || '').replace(/\/+$/, '');
    return page && page !== 'home' ? root + '/' + page.replace(/^\/+/, '') : root;
  }

  function updateNewTabOptionsVisibility() {
    document.getElementById('new-tab-options').style.display = document.getElementById('replace-new-tab').checked ? 'block' : 'none';
  }

  function saveOptions() {
    const replaceNewTab = document.getElementById('replace-new-tab').checked;
    const newTabPage = document.getElementById('new-tab-page').value || 'home';
    const newTabOpenSearch = document.getElementById('new-tab-open-search').checked;

    chrome.storage.local.get({ dashwiseBaseUrl: '' }, (auth) => {
      chrome.storage.sync.set({
        replaceNewTab,
        newTabPage,
        newTabOpenSearch,
        newTabUrl: buildPageUrl(newTabPage, auth.dashwiseBaseUrl),
      }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Settings saved.';
        setTimeout(() => { status.textContent = ''; }, 2000);
      });
    });
  }

  function restoreOptions() {
    chrome.storage.sync.get({ replaceNewTab: true, newTabPage: 'home', newTabOpenSearch: false }, (items) => {
      document.getElementById('replace-new-tab').checked = !!items.replaceNewTab;
      document.getElementById('new-tab-page').value = items.newTabPage || 'home';
      document.getElementById('new-tab-open-search').checked = !!items.newTabOpenSearch;
      updateNewTabOptionsVisibility();
    });
  }

  function handleLogout() {
    chrome.storage.local.remove(['dashwiseBaseUrl', 'dashwiseToken'], () => {
      const status = document.getElementById('logout-status');
      status.textContent = 'Logged out. You will need to sign in again from the popup.';
      status.style.color = '#2ecc71';
    });
  }

  async function refreshToken() {
    const result = await new Promise((resolve) => chrome.storage.local.get(['dashwiseBaseUrl'], resolve));
    const baseUrl = result.dashwiseBaseUrl || '';
    const statusEl = document.getElementById('refresh-token-status');
    if (!baseUrl) {
      statusEl.textContent = 'No server URL configured. Sign in from the popup first.';
      statusEl.style.color = '#e74c3c';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
      return;
    }

    let origin;
    try { origin = new URL(baseUrl).origin; } catch {
      statusEl.textContent = 'Invalid server URL';
      statusEl.style.color = '#e74c3c';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
      return;
    }

    const allTabs = await new Promise((resolve) => chrome.tabs.query({}, resolve));
    const targetTab = allTabs.find((t) => t.url && t.url.startsWith(origin));

    if (!targetTab) {
      statusEl.textContent = 'Open ' + origin + ' in a browser tab first';
      statusEl.style.color = '#e74c3c';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
      return;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => localStorage.getItem('pb_token'),
      });
      const token = results?.[0]?.result;
      if (token) {
        await new Promise((resolve) => chrome.storage.local.set({ dashwiseToken: token }, resolve));
        statusEl.textContent = 'Token refreshed from page';
        statusEl.style.color = '#2ecc71';
      } else {
        statusEl.textContent = 'No pb_token found on page';
        statusEl.style.color = '#e74c3c';
      }
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.style.color = '#e74c3c';
    }
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    restoreOptions();
    document.getElementById('replace-new-tab').addEventListener('change', updateNewTabOptionsVisibility);
    document.getElementById('save').addEventListener('click', saveOptions);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('refresh-token-btn').addEventListener('click', refreshToken);
  });
})();
