const PENDING_LINK_KEY = 'dashwisePendingLink';

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-to-dashwise-links',
      title: 'Save to Dashwise Links',
      contexts: ['page', 'link'],
    });
    chrome.contextMenus.create({
      id: 'add-to-dashwise-home-links',
      title: 'Add to Dashwise Home Links',
      contexts: ['page', 'link'],
    });
  });
}

chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup.addListener(createContextMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || (tab && tab.url);
  if (!url) return;

  const destination = info.menuItemId === 'add-to-dashwise-home-links'
    ? 'home-links'
    : 'links';

  chrome.storage.local.set({
    [PENDING_LINK_KEY]: {
      title: (tab && tab.title) || url,
      url,
      destination,
    },
  }, () => chrome.action.openPopup());
});
