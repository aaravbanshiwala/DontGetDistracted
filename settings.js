// settings.js - Settings page logic with dark mode support and license validation

// Import LicenseManager class
// In a real extension, you'd need to properly import or include the LicenseManager
// For this example, we'll define it in the same file or assume it's available globally

// Define the LicenseManager class in the settings context
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

// Initialize LicenseManager
const licenseManager = new LicenseManager();

// // Visual indicator for premium status
// function updatePremiumIndicator() {
//   chrome.storage.local.get(['whop_license'], (result) => {
//     const license = result.whop_license;
//     const premiumIndicator = document.getElementById('premium-indicator');
    
//     if (premiumIndicator) {
//       if (license && license.valid) {
//         premiumIndicator.innerHTML = '✨ Premium Active';
//         premiumIndicator.style.backgroundColor = 'linear-gradient(135deg, #8a2be2, #6a0dad)';
//         premiumIndicator.style.background = 'linear-gradient(135deg, #8a2be2, #6a0dad)';
//         premiumIndicator.style.color = 'white';
//         premiumIndicator.style.display = 'block';
//       } else {
//         premiumIndicator.innerHTML = '🔒 Premium Locked';
//         premiumIndicator.style.backgroundColor = '#f44336';
//         premiumIndicator.style.color = 'white';
//         premiumIndicator.style.display = 'block';
//       }
//     }
//   });
// }

function applyTheme(darkMode) {
  document.body.classList.toggle("dark", !!darkMode);
  const toggle = document.getElementById("dark-mode-toggle");
  if (toggle) {
    toggle.classList.toggle("active", !!darkMode);
  }
}

// Load settings on page load
document.addEventListener("DOMContentLoaded", () => {
  checkLicenseAndLoadSettings();
  setupEventListeners();
});

// Keep status section in sync when background updates storage
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (Object.prototype.hasOwnProperty.call(changes, "currentCount")) {
    // No current count display in new design
  }
});

async function checkLicenseAndLoadSettings() {
  // Check license before loading settings
  const hasValidLicense = await licenseManager.hasValidLicense();
  
  if (!hasValidLicense) {
    // Show license prompt instead of full settings
    showLicensePrompt();
    return;
  }
  
  // Load the full settings if license is valid
  loadSettings();
  
  // Update premium indicator
  // updatePremiumIndicator();
}

function showLicensePrompt() {
  // Create a license prompt overlay
  const promptDiv = document.createElement('div');
  promptDiv.id = 'license-prompt-overlay';
  promptDiv.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    ">
      <div style="
        background: white;
        padding: 30px;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        max-width: 450px;
        width: 90%;
        text-align: center;
      ">
        <h2 style="
          margin: 0 0 15px 0;
          font-size: 24px;
          color: #8a2be2;
        ">🔒 Premium Features Locked</h2>
        
        <p style="
          margin: 0 0 20px 0;
          font-size: 16px;
          line-height: 1.5;
          color: #333;
        ">
          This extension's premium features require a valid license. 
          Please activate your license to access all settings and functionality.
        </p>
        
        <div style="
          display: flex;
          flex-direction: column;
          gap: 12px;
        ">
          <button id="activate-license-btn" style="
            background: linear-gradient(135deg, #8a2be2, #6a0dad);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          ">Activate License</button>
          
          <button id="continue-basic-btn" style="
            background: #f5f5f5;
            color: #666;
            border: 1px solid #ddd;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          ">Continue with Basic Features</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(promptDiv);
  
  // Add event listeners to the new buttons
  document.getElementById('activate-license-btn').addEventListener('click', () => {
    // Open extension popup to activate license
    chrome.runtime.sendMessage({ action: 'openPopup' }, (response) => {
      if (chrome.runtime.lastError) {
        // If message fails, try opening options page or popup via other means
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        }
      }
    });
    // Remove the prompt
    document.getElementById('license-prompt-overlay').remove();
    // Load basic settings
    loadSettings();
  });
  
  document.getElementById('continue-basic-btn').addEventListener('click', () => {
    // Remove the prompt
    document.getElementById('license-prompt-overlay').remove();
    // Load basic settings
    loadSettings();
  });
}

function loadSettings() {
  chrome.storage.local.get(["settings"], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading settings:", chrome.runtime.lastError);
      return;
    }

    // Merge stored settings with defaults to ensure all fields exist
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    // Ensure trackedSites is always an array
    if (!Array.isArray(settings.trackedSites)) {
      settings.trackedSites = DEFAULT_SETTINGS.trackedSites;
    }

    console.log("[DGD] Loaded settings:", settings);

    // Apply dark mode
    applyTheme(settings.darkMode);

    // Load alert message
    const alertMessageEl = document.getElementById("alertMessage");
    if (alertMessageEl) {
      alertMessageEl.value = settings.alertMessage;
    }

    // Load threshold
    const thresholdEl = document.getElementById("threshold");
    if (thresholdEl) {
      thresholdEl.value = settings.threshold;
    }

    // Load tracked sites
    renderTrackedSites(settings.trackedSites || DEFAULT_SETTINGS.trackedSites);
  });
}

function setupEventListeners() {
  // Dark mode toggle
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", async () => {
      // Check license before allowing dark mode toggle
      const hasValidLicense = await licenseManager.hasValidLicense();
      
      if (!hasValidLicense) {
        showLicensePrompt();
        return;
      }
      
      const isDark = !document.body.classList.contains("dark");
      applyTheme(isDark);

      chrome.storage.local.get(["settings"], (data) => {
        const settings = data.settings || DEFAULT_SETTINGS;
        settings.darkMode = isDark;
        chrome.storage.local.set({ settings }, () => {
          showSaved();
        });
      });
    });
  }

  // Threshold stepper
  const thresholdMinus = document.getElementById("threshold-minus");
  const thresholdPlus = document.getElementById("threshold-plus");
  const thresholdInput = document.getElementById("threshold");

  if (thresholdMinus) {
    thresholdMinus.addEventListener("click", async () => {
      // Check license before allowing threshold adjustment
      const hasValidLicense = await licenseManager.hasValidLicense();
      
      if (!hasValidLicense) {
        showLicensePrompt();
        return;
      }
      
      const val = Math.max(1, parseInt(thresholdInput.value, 10) - 1);
      thresholdInput.value = val;
    });
  }

  if (thresholdPlus) {
    thresholdPlus.addEventListener("click", async () => {
      // Check license before allowing threshold adjustment
      const hasValidLicense = await licenseManager.hasValidLicense();
      
      if (!hasValidLicense) {
        showLicensePrompt();
        return;
      }
      
      const val = parseInt(thresholdInput.value, 10) + 1;
      thresholdInput.value = val;
    });
  }

  // Save button
  const saveButton = document.getElementById("save");
  if (saveButton) {
    saveButton.addEventListener("click", saveSettings);
  }

  // Add site button
  const addSiteButton = document.getElementById("add-site");
  if (addSiteButton) {
    addSiteButton.addEventListener("click", addNewSite);
  }

  // Test alert button removed in new design
}

async function saveSettings() {
  // Check license before saving premium settings
  const hasValidLicense = await licenseManager.hasValidLicense();
  
  if (!hasValidLicense) {
    showLicensePrompt();
    return;
  }
  
  const alertMessageEl = document.getElementById("alertMessage");
  const thresholdEl = document.getElementById("threshold");

  const alertMessage = alertMessageEl ? alertMessageEl.value.trim() : DEFAULT_SETTINGS.alertMessage;
  const threshold = thresholdEl ? Math.max(1, parseInt(thresholdEl.value, 10) || DEFAULT_SETTINGS.threshold) : DEFAULT_SETTINGS.threshold;
  const darkMode = document.body.classList.contains("dark");

  chrome.storage.local.get(["settings"], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error reading settings:", chrome.runtime.lastError);
      showSaved("Error!");
      return;
    }

    const oldSettings = data.settings || DEFAULT_SETTINGS;

    // Get tracked sites from DOM
    const siteElements = document.querySelectorAll(".site-row");
    const trackedSites = Array.from(siteElements).map((el, index) => {
      const patternEl = el.querySelector(".site-pattern");
      const enabledEl = el.querySelector(".site-enabled");
      const pattern = patternEl ? patternEl.value.trim() : "";
      const enabled = enabledEl ? enabledEl.checked : true;
      // Try to preserve existing ID, otherwise generate new one
      const existingId = oldSettings.trackedSites?.[index]?.id;
      return {
        pattern,
        enabled,
        id: existingId || `custom_${Date.now()}_${index}`
      };
    }).filter(site => site.pattern); // Remove empty patterns

    const newSettings = {
      threshold,
      alertMessage: alertMessage || DEFAULT_SETTINGS.alertMessage,
      darkMode,
      trackedSites: trackedSites.length > 0 ? trackedSites : DEFAULT_SETTINGS.trackedSites
    };

    console.log("[DGD] Saving settings:", newSettings);

    chrome.storage.local.set({ settings: newSettings }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving settings:", chrome.runtime.lastError);
        showSaved("Error!");
        return;
      }
      applyTheme(darkMode);
      showSaved("Saved!");
    });
  });
}

function renderTrackedSites(sites) {
  const container = document.getElementById("tracked-sites");
  if (!container) return;

  container.innerHTML = "";

  (sites || []).forEach((site, index) => {
    const siteDiv = document.createElement("div");
    siteDiv.className = "site-row";
    siteDiv.innerHTML = `
      <input type="text" class="site-pattern" value="${site.pattern}" placeholder="example.com/*">
      <label class="field inline">
        <input type="checkbox" class="site-enabled" ${site.enabled ? "checked" : ""}>
        <span>Enabled</span>
      </label>
      <button class="remove-btn secondary-button" data-index="${index}">Remove</button>
    `;
    container.appendChild(siteDiv);
  });

  // Add remove button listeners
  container.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      removeSite(index);
    });
  });
}

async function addNewSite() {
  // Check license before allowing adding new sites
  const hasValidLicense = await licenseManager.hasValidLicense();
  
  if (!hasValidLicense) {
    showLicensePrompt();
    return;
  }
  
  chrome.storage.local.get(["settings"], (data) => {
    const settings = data.settings || DEFAULT_SETTINGS;
    const nextSites = [...(settings.trackedSites || [])];
    nextSites.push({
      pattern: "",
      enabled: true,
      id: `custom_${Date.now()}_${nextSites.length}`
    });
    settings.trackedSites = nextSites;
    chrome.storage.local.set({ settings }, () => {
      renderTrackedSites(settings.trackedSites);
      showSaved();
    });
  });
}

async function removeSite(index) {
  // Check license before allowing removing sites
  const hasValidLicense = await licenseManager.hasValidLicense();
  
  if (!hasValidLicense) {
    showLicensePrompt();
    return;
  }
  
  chrome.storage.local.get(["settings"], (data) => {
    const settings = data.settings || DEFAULT_SETTINGS;
    const nextSites = [...(settings.trackedSites || [])];
    if (index >= 0 && index < nextSites.length) {
      nextSites.splice(index, 1);
    }
    settings.trackedSites = nextSites;
    chrome.storage.local.set({ settings }, () => {
      renderTrackedSites(settings.trackedSites);
      showSaved();
    });
  });
}

function showSaved(message = "Saved") {
  const saveBtn = document.getElementById("save");
  if (!saveBtn) return;

  const originalText = saveBtn.textContent;
  saveBtn.textContent = message;
  saveBtn.style.background = "#10b981";

  setTimeout(() => {
    saveBtn.textContent = originalText;
    saveBtn.style.background = "";
  }, 1500);
}

// Listen for messages from background script to open popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      // Fallback: try to open via extension URL
      const extensionUrl = chrome.runtime.getURL('popup.html');
      window.open(extensionUrl, 'extension_popup', 'width=400,height=500');
    }
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});