const COMMAND = "switch-to-last-tab";
const MENU_ID = "switch-tabs-test";
const STORAGE_KEY = "mruByWindow";

let mruByWindow = {};
let stateReady = restoreState();

function log(message, ...details) {
    console.log(`[LastTabSwitcher] ${message}`, ...details);
}

async function restoreState() {
    try {
        const stored = await chrome.storage.session.get(STORAGE_KEY);
        mruByWindow = stored[STORAGE_KEY] || {};
    } catch (error) {
        log("Could not restore state", error);
        mruByWindow = {};
    }
}

async function saveState() {
    try {
        await chrome.storage.session.set({ [STORAGE_KEY]: mruByWindow });
    } catch (error) {
        log("Could not save state", error);
    }
}

async function rememberTab(tabId, windowId) {
    await stateReady;
    const key = String(windowId);
    const current = mruByWindow[key] || [];
    mruByWindow[key] = [tabId, ...current.filter((id) => id !== tabId)];
    await saveState();
}

async function forgetTab(tabId, windowId) {
    await stateReady;
    const key = String(windowId);
    mruByWindow[key] = (mruByWindow[key] || []).filter((id) => id !== tabId);
    await saveState();
}

async function switchToLastTab() {
    await stateReady;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || activeTab.id == null || activeTab.windowId == null) {
        log("No active tab found");
        return;
    }

    const key = String(activeTab.windowId);
    const tabs = await chrome.tabs.query({ windowId: activeTab.windowId });
    const validIds = new Set(tabs.map((tab) => tab.id));
    const history = (mruByWindow[key] || []).filter((id) => validIds.has(id));
    if (history[0] !== activeTab.id) history.unshift(activeTab.id);

    let targetId = history.find((id) => id !== activeTab.id);
    if (targetId == null) {
        const candidate = tabs
            .filter((tab) => tab.id !== activeTab.id)
            .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
        targetId = candidate?.id;
    }

    if (targetId == null) {
        log("There is no other tab in the current window");
        return;
    }

    mruByWindow[key] = history;
    await saveState();
    try {
        await chrome.tabs.update(targetId, { active: true });
        log(`Switched from tab ${activeTab.id} to ${targetId}`);
    } catch (error) {
        await forgetTab(targetId, activeTab.windowId);
        log(`Could not activate tab ${targetId}`, error);
    }
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => rememberTab(tabId, windowId));
chrome.tabs.onRemoved.addListener((tabId, { windowId }) => forgetTab(tabId, windowId));
chrome.windows.onRemoved.addListener(async (windowId) => {
    await stateReady;
    delete mruByWindow[String(windowId)];
    await saveState();
});

chrome.commands.onCommand.addListener((command) => {
    if (command === COMMAND) switchToLastTab();
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: MENU_ID, title: "Switch to Last Tab (Test)", contexts: ["all"] });
    });
});

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === MENU_ID) switchToLastTab();
});

log("Background service worker loaded");
