// Import LicenseManager class
// In a real extension, you'd need to properly import or include the LicenseManager
// For this example, we'll define it in the same file or assume it's available globally
// background.js - NO imports needed

// Listen for license check requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkLicense') {
    chrome.storage.local.get(['whop_license'], (result) => {
      const license = result.whop_license;
      
      if (!license || !license.valid) {
        sendResponse({ hasLicense: false });
        return;
      }
      
      // Check if expired
      if (license.expiresAt) {
        const now = new Date();
        const expiry = new Date(license.expiresAt);
        if (now > expiry) {
          sendResponse({ hasLicense: false });
          return;
        }
      }
      
      sendResponse({ hasLicense: true, license: license });
    });
    
    return true; // Keep channel open
  }
  
  if (request.action === 'updateBadge') {
    updateBadge(request.hasLicense);
    sendResponse({ success: true });
    return true;
  }
});

// Update extension badge
function updateBadge(hasLicense) {
  if (hasLicense) {
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    chrome.action.setBadgeText({ text: '✓' });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    chrome.action.setBadgeText({ text: '!' });
  }
}

// Check on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['whop_license'], (result) => {
    updateBadge(result.whop_license?.valid || false);
  });
});

// Check on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['whop_license'], (result) => {
    updateBadge(result.whop_license?.valid || false);
  });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.whop_license) {
    updateBadge(changes.whop_license.newValue?.valid || false);
  }
});

// Define the LicenseManager class in the background context
class LicenseManager {
  constructor() {
    this.API_BASE_URL = 'https://licensecheckerwhop.abhishek1317.workers.dev';
    this.CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
    this.OFFLINE_GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  }

  async generateHWID() {
    // Collect various browser fingerprinting parameters
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('LicenseCheck', 2, 2);
    }
    
    const fingerprintData = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas ? canvas.toDataURL() : '',
      webgl: this.getWebGLFingerprint(),
    };

    // Create a hash of the fingerprint data
    const fingerprintString = JSON.stringify(fingerprintData);
    return this.sha256(fingerprintString);
  }

  getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) return 'no-webgl';
      
      const renderer = gl.getParameter(gl.RENDERER);
      const vendor = gl.getParameter(gl.VENDOR);
      
      return `${renderer}-${vendor}`;
    } catch (e) {
      return 'webgl-error';
    }
  }

  async sha256(message) {
    // Simple SHA-256 implementation using crypto.subtle
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async validateLicenseKey(key) {
    try {
      const hwid = await this.generateHWID();
      
      const response = await fetch(`${this.API_BASE_URL}/api/validate-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ licenseKey: key, hwid }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Store the license data in chrome.storage.local
      const licenseData = {
        key,
        valid: data.valid,
        expiresAt: data.expiresAt,
        validatedAt: Date.now(),
        hwid,
      };
      
      await this.setStoredLicense(licenseData);
      
      return {
        valid: data.valid,
        message: data.message,
        expiresAt: data.expiresAt,
      };
    } catch (error) {
      console.error('License validation error:', error);
      
      // Check if there's a stored license that's still within the grace period
      const storedLicense = await this.getStoredLicense();
      if (storedLicense && this.isWithinGracePeriod(storedLicense)) {
        return {
          valid: storedLicense.valid,
          message: storedLicense.valid ? 'Using cached license data (offline)' : 'Using cached invalid license data (offline)',
          expiresAt: storedLicense.expiresAt,
        };
      }
      
      return {
        valid: false,
        message: 'License validation failed and no cached data available',
      };
    }
  }

  async hasValidLicense() {
    const licenseData = await this.getStoredLicense();
    
    if (!licenseData) {
      return false;
    }

    // Check if license is still valid
    if (!licenseData.valid) {
      return false;
    }

    // Check if license has expired
    if (licenseData.expiresAt) {
      const now = new Date();
      const expiryDate = new Date(licenseData.expiresAt);
      if (now > expiryDate) {
        return false;
      }
    }

    // Check if cache is still valid (revalidate if needed)
    if (this.isCacheExpired(licenseData)) {
      // Try to revalidate in background
      this.validateLicenseKey(licenseData.key).catch(error => {
        console.error('Background validation failed:', error);
      });
    }

    return true;
  }

  async getStoredLicense() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['whop_license'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting stored license:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        
        resolve(result.whop_license || null);
      });
    });
  }

  setStoredLicense(licenseData) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ whop_license: licenseData }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error storing license:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  clearLicense() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove('whop_license', () => {
        if (chrome.runtime.lastError) {
          console.error('Error clearing license:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async resetLicense(key) {
    try {
      const response = await fetch(`${this.API_BASE_URL}/api/reset-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ licenseKey: key }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Clear the stored license if reset was successful
      if (data.success) {
        await this.clearLicense();
      }
      
      return {
        success: data.success,
        message: data.message,
      };
    } catch (error) {
      console.error('License reset error:', error);
      return {
        success: false,
        message: 'License reset failed',
      };
    }
  }

  isCacheExpired(licenseData) {
    const now = Date.now();
    const cacheExpiryTime = licenseData.validatedAt + this.CACHE_DURATION;
    return now > cacheExpiryTime;
  }

  isWithinGracePeriod(licenseData) {
    const now = Date.now();
    const gracePeriodExpiryTime = licenseData.validatedAt + this.OFFLINE_GRACE_PERIOD;
    return now <= gracePeriodExpiryTime;
  }
}

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
  lastSiteType: null
};

// Initialize LicenseManager
const licenseManager = new LicenseManager();

// Debug logging helper
function log(...args) {
  console.log("[DGD]", ...args);
}

// Per-tab URL tracking to prevent double-counting
const tabUrls = new Map(); // tabId -> last processed URL

function getStorage(cb) {
  chrome.storage.local.get(["settings", "currentCount", "lastSiteType"], (data) => {
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
      lastSiteType: data.lastSiteType || DEFAULT_STATE.lastSiteType
    };

    cb({ settings, state });
  });
}

function saveStorage({ settings, state }, cb) {
  const payload = {
    settings,
    currentCount: state.currentCount,
    lastSiteType: state.lastSiteType
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
        return site.id;
      }
    }
  } catch (e) {
    // ignore invalid URLs
  }

  return null;
}

async function handleUrl(url, tabId) {
  // Check license before executing premium features
  const hasValidLicense = await licenseManager.hasValidLicense();
  
  if (!hasValidLicense) {
    // If no valid license, only allow basic functionality
    // Skip premium tracking features
    log("No valid license - skipping premium tracking");
    return;
  }

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
    log("Site type for", url, ":", siteType);

    if (siteType) {
      if (state.lastSiteType === siteType) {
        state.currentCount += 1;
        log("Consecutive visit, count:", state.currentCount);
      } else {
        state.currentCount = 1;
        state.lastSiteType = siteType;
        log("New site type, count reset to 1, type:", siteType);
      }

      if (state.currentCount >= (settings.threshold || DEFAULT_SETTINGS.threshold)) {
        log("Threshold reached!", state.currentCount, ">=", settings.threshold);
        triggerAlert();
        state.currentCount = 0;
        state.lastSiteType = null;
      }
    } else {
      if (state.lastSiteType !== null) {
        log("Non-tracked site, resetting count");
        state.currentCount = 0;
        state.lastSiteType = null;
      }
    }

    saveStorage({ settings, state });
  });
}

async function triggerAlert() {
  // Check license before showing alert
  const hasValidLicense = await licenseManager.hasValidLicense();
  
  if (!hasValidLicense) {
    log("No valid license - skipping alert trigger");
    return;
  }

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
        lastSiteType: DEFAULT_STATE.lastSiteType
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

// Handle messages from the alert page for acknowledging alerts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "reset_counter") {
    // Check license before allowing counter reset
    licenseManager.hasValidLicense().then(hasValidLicense => {
      if (!hasValidLicense) {
        log("No valid license - skipping counter reset");
        sendResponse({ ok: false, error: "No valid license" });
        return;
      }
      
      // Reset everything from settings page
      getStorage(({ settings, state }) => {
        state.currentCount = 0;
        state.lastSiteType = null;
        // Also clear the tab URL cache
        tabUrls.clear();
        saveStorage({ settings, state }, () => {
          log("Counter reset from settings");
          sendResponse({ ok: true });
        });
      });
    });
    return true;
  }

  if (message.type === "test_alert") {
    // Manual test to verify alert works
    licenseManager.hasValidLicense().then(hasValidLicense => {
      if (!hasValidLicense) {
        log("No valid license - skipping test alert");
        sendResponse({ ok: false, error: "No valid license" });
        return;
      }
      
      log("Manual alert test triggered");
      triggerAlert();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "alert_acknowledged") {
    // User said they're getting back to work: clear counters
    licenseManager.hasValidLicense().then(hasValidLicense => {
      if (!hasValidLicense) {
        log("No valid license - skipping alert acknowledgment");
        sendResponse({ ok: false, error: "No valid license" });
        return;
      }
      
      getStorage(({ settings, state }) => {
        state.currentCount = 0;
        state.lastSiteType = null;
        saveStorage({ settings, state }, () => {
          sendResponse({ ok: true });
        });
      });
    });
    return true;
  }
});