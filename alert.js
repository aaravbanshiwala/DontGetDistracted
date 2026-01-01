// Import LicenseManager class
// In a real extension, you'd need to properly import or include the LicenseManager
// For this example, we'll define it in the same file or assume it's available globally

// Define the LicenseManager class in the alert context
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

// Initialize LicenseManager
const licenseManager = new LicenseManager();

function applyTheme(darkMode) {
  document.body.classList.toggle("dark", !!darkMode);
}

document.addEventListener("DOMContentLoaded", () => {
  checkLicenseAndLoadAlert();
  setupAlertListeners();
});

async function checkLicenseAndLoadAlert() {
  // Check license before loading the alert
  const hasValidLicense = await licenseManager.hasValidLicense();
  
  if (!hasValidLicense) {
    // Show license activation prompt instead of alert
    showLicensePrompt();
    return;
  }
  
  // Load the alert if license is valid
  loadAlert();
}

function showLicensePrompt() {
  // Clear existing content
  document.body.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      background: linear-gradient(135deg, #8a2be2, #6a0dad);
      color: white;
    ">
      <div style="
        background: white;
        color: #333;
        padding: 30px;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        max-width: 400px;
        width: 100%;
      ">
        <h2 style="
          margin: 0 0 15px 0;
          font-size: 24px;
          color: #8a2be2;
        ">⚠️ Premium Feature Locked</h2>
        
        <p style="
          margin: 0 0 20px 0;
          font-size: 16px;
          line-height: 1.5;
        ">
          This alert is a premium feature that requires a valid license.
          Please activate your license to continue using this functionality.
        </p>
        
        <div style="
          display: flex;
          flex-direction: column;
          gap: 10px;
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
          
          <button id="dismiss-prompt-btn" style="
            background: #f5f5f5;
            color: #666;
            border: 1px solid #ddd;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          ">Continue Without Premium</button>
        </div>
      </div>
    </div>
  `;
  
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
    window.close();
  });
  
  document.getElementById('dismiss-prompt-btn').addEventListener('click', () => {
    // User chooses to continue without premium features
    // Just close the tab
    window.close();
  });
}

function loadAlert() {
  chrome.storage.local.get(["settings"], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading alert settings:", chrome.runtime.lastError);
      return;
    }

    const defaultMessage = "What are you doing!? You're wasting time. GET TO WORK!";
    const settings = data.settings || { alertMessage: defaultMessage, darkMode: false };

    console.log("[DGD] Alert loaded with settings:", settings);

    applyTheme(settings.darkMode);

    const messageEl = document.getElementById("alert-message");
    if (messageEl) {
      messageEl.textContent = settings.alertMessage || defaultMessage;
    }
  });
}

function setupAlertListeners() {
  const backBtn = document.getElementById("back-to-work");
  if (backBtn) {
    backBtn.addEventListener("click", async () => {
      // Check license before allowing acknowledgment
      const hasValidLicense = await licenseManager.hasValidLicense();
      
      if (!hasValidLicense) {
        console.log("[DGD] No valid license - skipping acknowledgment");
        // Show license prompt
        showLicensePrompt();
        return;
      }
      
      console.log("[DGD] Back to work clicked");
      // User acknowledges and gets back to work: reset counter
      chrome.runtime.sendMessage({ type: "alert_acknowledged" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
        }
        console.log("[DGD] Acknowledged, closing tab");
        window.close();
      });
    });
  }

  const dismissBtn = document.getElementById("dismiss-alert");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", async () => {
      // Check license before allowing dismissal
      const hasValidLicense = await licenseManager.hasValidLicense();
      
      if (!hasValidLicense) {
        console.log("[DGD] No valid license - showing license prompt");
        // Show license prompt instead of dismissing
        showLicensePrompt();
        return;
      }
      
      console.log("[DGD] Dismiss clicked");
      // User dismisses: just close the tab (no snooze in new logic)
      window.close();
    });
  }

  // ESC key closes the alert tab
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Check license before allowing escape to close
      licenseManager.hasValidLicense().then(hasValidLicense => {
        if (!hasValidLicense) {
          // Show license prompt instead of closing
          showLicensePrompt();
        } else {
          window.close();
        }
      });
    }
  });
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