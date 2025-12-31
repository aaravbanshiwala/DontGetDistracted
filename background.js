const DEFAULT_SETTINGS = {
  threshold: 10,
  alertMessage: "What are you doing!? You're wasting time. GET TO WORK!",
  darkMode: false,
  trackedSites: [
    { pattern: "youtube.com/shorts/*", enabled: true, id: "youtube_shorts" },
    { pattern: "tiktok.com/*", enabled: true, id: "tiktok" },
    { pattern: "instagram.com/*", enabled: true, id: "instagram" }
  ]
};

const DEFAULT_STATE = {
  currentCount: 0,
  lastSiteType: null,
  snoozeCountRemaining: 0
};

// Debug logging helper
function log(...args) {
  console.log("[DGD]", ...args);
}

// Per-tab URL tracking to prevent double-counting
const tabUrls = new Map(); // tabId -> last processed URL

function getStorage(cb) {
  chrome.storage.local.get(["settings", "currentCount", "lastSiteType", "snoozeCountRemaining"], (data) => {
    if (chrome.runtime.lastError) {
      log("Error reading storage:", chrome.runtime.lastError);
      cb({ settings: DEFAULT_SETTINGS, state: DEFAULT_STATE });
      return;
    }

    const settings = {
      ...DEFAULT_SETTINGS,
      ...(data.settings || {}),
      trackedSites: (data.settings && data.settings.trackedSites) || DEFAULT_SETTINGS.trackedSites
    };

    const state = {
      ...DEFAULT_STATE,
      currentCount: typeof data.currentCount === "number" ? data.currentCount : DEFAULT_STATE.currentCount,
      lastSiteType: data.lastSiteType !== undefined ? data.lastSiteType : DEFAULT_STATE.lastSiteType,
      snoozeCountRemaining:
        typeof data.snoozeCountRemaining === "number"
          ? data.snoozeCountRemaining
          : DEFAULT_STATE.snoozeCountRemaining
    };

    cb({ settings, state });
  });
}

function saveStorage({ settings, state }, cb) {
  const payload = {
    settings,
    currentCount: state.currentCount,
    lastSiteType: state.lastSiteType,
    snoozeCountRemaining: state.snoozeCountRemaining
  };
  chrome.storage.local.set(payload, () => {
    if (chrome.runtime.lastError) {
      log("Error saving storage:", chrome.runtime.lastError);
    }
    if (cb) cb();
  });
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexString = "^" + escaped.replace(/\*/g, ".*") + "$";
  return new RegExp(regexString);
}

function getSiteType(url, trackedSites) {
  if (!url) return null;

  let siteType = null;
  try {
    const u = new URL(url);
    const host = u.host;
    const bareHost = host.replace(/^www\./, "");
    const urlStr = `${host}${u.pathname}`;
    const altUrlStr = `${bareHost}${u.pathname}`;

    for (const site of trackedSites) {
      if (!site.enabled || !site.pattern) continue;
      const regex = wildcardToRegExp(site.pattern);
      if (regex.test(urlStr) || regex.test(altUrlStr)) {
        siteType = site.id || site.pattern;
        break;
      }
    }
  } catch (e) {
    // ignore invalid URLs
  }

  return siteType;
}

function handleUrl(url, tabId) {
  // Skip extension pages entirely
  if (url.startsWith("chrome") || url.startsWith("about:") || url.startsWith("edge:")) {
    log("Skipping browser/extension URL:", url);
    return;
  }

  // Deduplicate: skip if this tab already processed this exact URL
  if (tabId !== undefined) {
    const lastUrl = tabUrls.get(tabId);
    if (lastUrl === url) {
      log("Skipping duplicate URL for tab", tabId, ":", url);
      return;
    }
    tabUrls.set(tabId, url);
  }

  getStorage(({ settings, state }) => {
    const siteType = getSiteType(url, settings.trackedSites || []);
    const threshold = settings.threshold || DEFAULT_SETTINGS.threshold;

    log("handleUrl:", url, "| siteType:", siteType, "| lastSiteType:", state.lastSiteType, "| count:", state.currentCount);

    if (!siteType) {
      // Non-tracked site: RESET the streak immediately
      if (state.currentCount > 0 || state.lastSiteType !== null) {
        log("Non-tracked site visited, resetting counter from", state.currentCount, "to 0");
        state.currentCount = 0;
        state.lastSiteType = null;
        saveStorage({ settings, state });
      }
      return;
    }

    // Tracked site visited
    if (state.lastSiteType === siteType) {
      // Same site type: increment counter
      state.currentCount += 1;
      log("Same site type, incrementing count to", state.currentCount);
    } else {
      // Different tracked site type: reset and start counting
      state.currentCount = 1;
      state.lastSiteType = siteType;
      log("New site type, starting count at 1 for", siteType);
    }

    // Check if threshold reached
    if (state.currentCount >= threshold) {
      log("Threshold reached!", state.currentCount, ">=", threshold);
      if (state.snoozeCountRemaining && state.snoozeCountRemaining > 0) {
        // In snooze mode: consume one "ignored" alert
        state.snoozeCountRemaining -= 1;
        log("Snooze active, remaining:", state.snoozeCountRemaining);
      } else {
        // Normal behavior: show alert tab
        log("Triggering alert!");
        triggerAlert();
      }
      // Reset counter after triggering
      state.currentCount = 0;
      state.lastSiteType = null;
    }

    saveStorage({ settings, state });
  });
}

function triggerAlert() {
  const alertUrl = chrome.runtime.getURL("alert.html");
  log("Opening alert page:", alertUrl);
  chrome.tabs.create({ url: alertUrl }, (tab) => {
    if (chrome.runtime.lastError) {
      log("Error creating alert tab:", chrome.runtime.lastError);
    } else {
      log("Alert tab created:", tab?.id);
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  // Initialize defaults on first install
  chrome.storage.local.get(["settings"], (data) => {
    if (!data.settings) {
      chrome.storage.local.set({
        settings: DEFAULT_SETTINGS,
        currentCount: DEFAULT_STATE.currentCount,
        lastSiteType: DEFAULT_STATE.lastSiteType,
        snoozeCountRemaining: DEFAULT_STATE.snoozeCountRemaining
      });
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only process on URL changes or complete status with a URL
  if (changeInfo.url || (changeInfo.status === "complete" && tab.url)) {
    const url = changeInfo.url || tab.url;
    log("Tab updated:", tabId, url);
    handleUrl(url, tabId);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) {
      log("Error getting tab:", chrome.runtime.lastError);
      return;
    }
    if (tab && tab.url) {
      log("Tab activated:", activeInfo.tabId, tab.url);
      handleUrl(tab.url, activeInfo.tabId);
    }
  });
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabUrls.delete(tabId);
});

// Handle messages from the alert page for snoozing and acknowledging alerts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "alert_dismissed") {
    // User clicked Dismiss: ignore the next 20 alert opportunities
    getStorage(({ settings, state }) => {
      state.snoozeCountRemaining = 20;
      saveStorage({ settings, state }, () => {
        sendResponse({ ok: true });
      });
    });
    return true; // keep the message channel open for async response
  }

  if (message.type === "reset_counter") {
    // Reset everything from settings page
    getStorage(({ settings, state }) => {
      state.currentCount = 0;
      state.lastSiteType = null;
      state.snoozeCountRemaining = 0;
      // Also clear the tab URL cache
      tabUrls.clear();
      saveStorage({ settings, state }, () => {
        log("Counter and snooze reset from settings");
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === "test_alert") {
    // Manual test to verify alert works
    log("Manual alert test triggered");
    triggerAlert();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "alert_acknowledged") {
    // User said they're getting back to work: clear counters and end snooze
    getStorage(({ settings, state }) => {
      state.currentCount = 0;
      state.lastSiteType = null;
      state.snoozeCountRemaining = 0;
      saveStorage({ settings, state }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});
