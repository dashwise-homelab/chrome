(function () {
  let baseUrl = '';
  let token = '';
  let clockInterval = null;
  let notifInterval = null;

  // ---- Storage helpers ----
  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }
  function storageRemove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }
  function syncGet(keys) {
    return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
  }
  function syncSet(obj) {
    return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
  }

  // ---- Screen management ----
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
  }

  // ---- Toast ----
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ---- Auth ----
  async function loadAuth() {
    const result = await storageGet(['dashwiseBaseUrl', 'dashwiseToken']);
    baseUrl = result.dashwiseBaseUrl || '';
    token = result.dashwiseToken || '';
  }

  async function saveAuth(url, t) {
    await storageSet({ dashwiseBaseUrl: url, dashwiseToken: t });
    baseUrl = url;
    token = t;
  }

  async function clearAuth() {
    await storageRemove(['dashwiseBaseUrl', 'dashwiseToken']);
    baseUrl = '';
    token = '';
  }

  // ---- API client ----
  async function apiFetch(path, opts = {}) {
    const url = baseUrl.replace(/\/+$/, '') + '/api/v1' + path;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || 'HTTP ' + res.status;
      throw new Error(msg);
    }
    return data;
  }

  // ---- Login ----
  async function handleLogin() {
    const serverUrl = document.getElementById('server-url').value.trim();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    errEl.textContent = '';
    if (!serverUrl || !email || !password) {
      errEl.textContent = 'All fields required.';
      return;
    }

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const normUrl = serverUrl.replace(/\/+$/, '');
      const res = await fetch(normUrl + '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && (data.message || data.error)) || 'Login failed');

      const authToken = data.token || data.accessToken || data.access_token;
      if (!authToken) throw new Error('No token in response');

      await saveAuth(normUrl, authToken);
      showScreen('main');
      startClock();
      loadNotifications();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  // ---- Clock ----
  function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  }

  function updateClock() {
    const el = document.getElementById('current-time');
    if (el) {
      el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  // ---- Notifications ----
  async function loadNotifications() {
    if (!token || !baseUrl) return;
    const container = document.getElementById('notif-list');
    try {
      const data = await apiFetch('/notifications?unread=true');
      const items = data && (data.data || data.notifications || (Array.isArray(data) ? data : []));
      if (!items || items.length === 0) {
        container.innerHTML = '<div class="notif-empty">No unread notifications</div>';
        return;
      }
      container.innerHTML = items.map((n) => {
        const ts = n.createdAt || n.created_at || n.timestamp;
        const timeStr = ts ? new Date(ts).toLocaleString() : '';
        return '<div class="notif-card">' +
          (n.title ? '<div class="notif-card-title">' + escapeHtml(n.title) + '</div>' : '') +
          (n.message || n.body ? '<div class="notif-card-message">' + escapeHtml(n.message || n.body) + '</div>' : '') +
          (timeStr ? '<div class="notif-card-time">' + timeStr + '</div>' : '') +
          '</div>';
      }).join('');
    } catch {
      container.innerHTML = '<div class="notif-empty">Could not load notifications</div>';
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Link actions (current tab) ----
  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  async function addToHomeLinks() {
    const tab = await getActiveTab();
    if (!tab) { showToast('No active tab'); return; }
    try {
      await apiFetch('/links/items', {
        method: 'POST',
        body: JSON.stringify({ title: tab.title || tab.url, url: tab.url }),
      });
      showToast('Added to home links');
    } catch (err) {
      showToast(err.message);
    }
  }

  // ---- Add Link Screen ----
  let addLinkTab = null;

  async function openAddLink() {
    addLinkTab = await getActiveTab();
    if (!addLinkTab) { showToast('No active tab'); return; }

    document.getElementById('add-name').value = addLinkTab.title || '';
    document.getElementById('add-url').value = addLinkTab.url || '';
    document.getElementById('add-icon').value = '';
    document.getElementById('add-link-error').textContent = '';
    document.getElementById('add-icon-preview').innerHTML = '';

    await Promise.all([loadCollections(), loadTags()]);
    await autoDetectIcon();

    showScreen('add-link');
  }

  function closeAddLink() {
    addLinkTab = null;
    showScreen('main');
  }

  async function loadCollections() {
    const sel = document.getElementById('add-collection');
    sel.innerHTML = '<option value="">None</option>';
    try {
      const data = await apiFetch('/links/collections');
      const items = data && (data.data || data.collections || (Array.isArray(data) ? data : []));
      if (items) {
        items.forEach((c) => {
          const name = c.name || c.title || c;
          const id = c.id || c._id || name;
          const opt = document.createElement('option');
          opt.value = typeof c === 'string' ? c : id;
          opt.textContent = typeof c === 'string' ? c : name;
          sel.appendChild(opt);
        });
      }
    } catch { /* ignore */ }
  }

  async function loadTags() {
    const input = document.getElementById('add-tags');
    try {
      const data = await apiFetch('/links/tags');
      const items = data && (data.data || data.tags || (Array.isArray(data) ? data : []));
      if (items && items.length) {
        const tags = items.map((t) => typeof t === 'string' ? t : (t.name || t.title || t.id || '')).filter(Boolean);
        input.placeholder = tags.length ? 'e.g. ' + tags.slice(0, 3).join(', ') : 'tag1, tag2, tag3';
      }
    } catch { /* ignore */ }
  }

  async function autoDetectIcon() {
    const url = document.getElementById('add-url').value.trim();
    const iconInput = document.getElementById('add-icon');
    const preview = document.getElementById('add-icon-preview');

    if (!url) return;
    let found = null;

    try {
      const parsed = new URL(url.includes('://') ? url : 'https://' + url);
      const favicon = parsed.origin + '/favicon.ico';
      const ok = await testImageLoad(favicon);
      if (ok) found = favicon;

      if (!found) {
        const google = 'https://www.google.com/s2/favicons?sz=128&domain=' + parsed.hostname;
        const ok2 = await testImageLoad(google);
        if (ok2) found = google;
      }
    } catch { /* ignore */ }

    if (found) {
      iconInput.value = found;
      preview.innerHTML = '<img src="' + escapeAttr(found) + '" style="width:20px;height:20px;border-radius:4px;" alt="icon">';
    } else if (!iconInput.value) {
      preview.innerHTML = '';
    }
  }

  function testImageLoad(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  function escapeAttr(s) {
    return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function submitNewLink() {
    const name = document.getElementById('add-name').value.trim();
    const url = document.getElementById('add-url').value.trim();
    const icon = document.getElementById('add-icon').value.trim();
    const collection = document.getElementById('add-collection').value;
    const tagsRaw = document.getElementById('add-tags').value.trim();
    const errEl = document.getElementById('add-link-error');
    errEl.textContent = '';

    if (!name || !url) {
      errEl.textContent = 'Name and URL are required.';
      return;
    }

    const payload = { title: name, url: url };
    if (icon) payload.iconUrl = icon;
    if (collection) payload.collection = collection;
    if (tagsRaw) payload.tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

    console.log('[Dashwise] submit payload:', JSON.stringify(payload));

    const btn = document.getElementById('add-link-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const response = await fetch(
        baseUrl.replace(/\/+$/, '') + '/api/v1/links/items',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify(payload),
        }
      );
      console.log('[Dashwise] response status:', response.status);
      const data = await response.json().catch(() => null);
      console.log('[Dashwise] response body:', data);
      if (!response.ok) throw new Error((data && (data.message || data.error)) || 'HTTP ' + response.status);
      showToast('Link added');
      closeAddLink();
    } catch (err) {
      console.error('[Dashwise] error:', err);
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Link';
    }
  }

  function generateQR() {
    getActiveTab().then((tab) => {
      const url = tab ? encodeURIComponent(tab.url) : '';
      const preview = document.getElementById('qr-preview');
      if (!url) { showToast('No active tab'); return; }
      preview.style.display = 'block';
      preview.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + url + '" alt="QR code" style="width:180px;height:180px;border-radius:8px;background:#fff;padding:8px;">';
    });
  }

  // ---- Settings ----
  function buildPageUrl(page) {
    const root = baseUrl.replace(/\/+$/, '');
    return page && page !== 'home' ? root + '/' + page.replace(/^\/+/, '') : root;
  }

  function updateNewTabOptionsVisibility() {
    document.getElementById('new-tab-options').style.display = document.getElementById('replace-new-tab').checked ? 'block' : 'none';
  }

  async function loadNewTabSettings() {
    const items = await syncGet({ replaceNewTab: true, newTabPage: 'home', newTabOpenSearch: false });
    document.getElementById('replace-new-tab').checked = !!items.replaceNewTab;
    document.getElementById('new-tab-page').value = items.newTabPage || 'home';
    document.getElementById('new-tab-open-search').checked = !!items.newTabOpenSearch;
    updateNewTabOptionsVisibility();
  }

  async function saveNewTabSettings() {
    const replaceNewTab = document.getElementById('replace-new-tab').checked;
    const newTabPage = document.getElementById('new-tab-page').value || 'home';
    const newTabOpenSearch = document.getElementById('new-tab-open-search').checked;
    await syncSet({ replaceNewTab, newTabPage, newTabOpenSearch, newTabUrl: buildPageUrl(newTabPage) });
    const status = document.getElementById('settings-status');
    status.textContent = 'Saved';
    status.style.color = '#2ecc71';
    setTimeout(() => { status.textContent = ''; }, 2000);
  }

  async function refreshToken() {
    const result = await storageGet(['dashwiseBaseUrl']);
    const baseUrl = result.dashwiseBaseUrl || '';
    const statusEl = document.getElementById('refresh-token-status');
    if (!baseUrl) {
      statusEl.textContent = 'No server URL configured. Sign in first.';
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
        await storageSet({ dashwiseToken: token });
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

  async function handleLogout() {
    if (clockInterval) clearInterval(clockInterval);
    if (notifInterval) clearInterval(notifInterval);
    clockInterval = null;
    notifInterval = null;
    await clearAuth();
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
    showScreen('login');
  }

  // ---- Init ----
  async function init() {
    await loadAuth();

    // Event listeners
    document.getElementById('login-btn').addEventListener('click', handleLogin);

    document.getElementById('settings-btn').addEventListener('click', () => {
      loadNewTabSettings();
      showScreen('settings');
    });
    document.getElementById('settings-back').addEventListener('click', () => {
      showScreen('main');
    });
    document.getElementById('replace-new-tab').addEventListener('change', updateNewTabOptionsVisibility);
    document.getElementById('save-url-btn').addEventListener('click', saveNewTabSettings);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('refresh-token-btn').addEventListener('click', refreshToken);

    document.getElementById('action-home-link').addEventListener('click', addToHomeLinks);
    document.getElementById('action-add-link').addEventListener('click', openAddLink);
    document.getElementById('action-qr').addEventListener('click', generateQR);

    document.getElementById('add-link-back').addEventListener('click', closeAddLink);
    document.getElementById('add-link-cancel').addEventListener('click', closeAddLink);
    document.getElementById('add-link-save').addEventListener('click', submitNewLink);
    document.getElementById('add-icon-detect').addEventListener('click', autoDetectIcon);

    // Enter key on password field triggers login
    document.getElementById('login-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    // Show correct screen
    if (token && baseUrl) {
      showScreen('main');
      startClock();
      loadNotifications();
      notifInterval = setInterval(loadNotifications, 60000);
    } else {
      showScreen('login');
      // Pre-fill saved server URL
      const result = await storageGet(['dashwiseBaseUrl']);
      if (result.dashwiseBaseUrl) {
        document.getElementById('server-url').value = result.dashwiseBaseUrl;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
