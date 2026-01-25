// Most Recently Used (MRU) list of tabs
let mru = [];

// Logging helper
function log(msg) {
    console.log('[LastTabSwitcher] ' + msg);
}

// Initialize MRU list with all currently open tabs
function initializeMRU() {
    chrome.windows.getAll({ populate: true }, (windows) => {
        mru = [];
        windows.forEach((window) => {
            window.tabs.forEach((tab) => {
                if (!mru.includes(tab.id)) {
                    mru.push(tab.id);
                }
            });
        });
        log('MRU initialized: ' + JSON.stringify(mru));
    });
}

// Move tab to front of MRU list
function moveTabToFront(tabId) {
    const index = mru.indexOf(tabId);
    if (index > -1) {
        mru.splice(index, 1);
    }
    mru.unshift(tabId);
    log('Moved tab ' + tabId + ' to front. MRU: ' + JSON.stringify(mru));
}

// Remove tab from MRU list
function removeTabFromMRU(tabId) {
    const index = mru.indexOf(tabId);
    if (index > -1) {
        mru.splice(index, 1);
        log('Removed tab ' + tabId + '. MRU: ' + JSON.stringify(mru));
    }
}

// Perform the switch
function switchToLastTab() {
    log('Switch command received. MRU: ' + JSON.stringify(mru));
    
    if (mru.length >= 2) {
        const targetTabId = mru[1];
        log('Switching to tab ' + targetTabId);
        chrome.tabs.update(targetTabId, { active: true });
    } else if (mru.length === 1) {
        log('Only one tab in MRU, looking for other tabs');
        chrome.tabs.query({}, (tabs) => {
            const otherTab = tabs.find(tab => tab.id !== mru[0]);
            if (otherTab) {
                log('Found other tab ' + otherTab.id + ', switching');
                chrome.tabs.update(otherTab.id, { active: true });
            }
        });
    } else {
        log('MRU is empty!');
    }
}

// Listen for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    log('Tab activated: ' + activeInfo.tabId);
    moveTabToFront(activeInfo.tabId);
});

// Listen for tab creation
chrome.tabs.onCreated.addListener((tab) => {
    log('Tab created: ' + tab.id);
    moveTabToFront(tab.id);
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    log('Tab removed: ' + tabId);
    removeTabFromMRU(tabId);
});

// Handle the keyboard command
chrome.commands.onCommand.addListener((command) => {
    log('Command received: ' + command);
    if (command === "switch-to-last-tab") {
        switchToLastTab();
    }
});

// Create context menu for testing
chrome.runtime.onInstalled.addListener(() => {
    initializeMRU();
    chrome.contextMenus.create({
        id: "switch-tabs-test",
        title: "Switch to Last Tab (Test)",
        contexts: ["all"]
    });
    log('Extension installed and initialized');
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "switch-tabs-test") {
        switchToLastTab();
    }
});

// Listen for startup
chrome.runtime.onStartup.addListener(() => {
    log('Browser startup detected');
    initializeMRU();
});

// Initialize immediately
log('Background script loaded');
initializeMRU();



