class LicenseManager {
  constructor() {
    this.API_BASE_URL = 'https://licensecheckerwhop.abhishek1317.workers.dev';
    this.CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
    this.OFFLINE_GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  }

  /**
   * Generates a hardware ID (HWID) using browser fingerprinting
   */
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

  /**
   * Gets WebGL fingerprint for additional entropy
   */
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

  /**
   * Creates a SHA-256 hash of the input string
   */
  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validates a license key through the backend API
   */
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

  /**
   * Checks if there is a valid license stored
   */
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

  /**
   * Retrieves stored license data from chrome.storage.local
   */
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

  /**
   * Stores license data in chrome.storage.local
   */
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

  /**
   * Clears stored license data — this is the ONLY allowed "reset" mechanism.
   * No network requests. Pure local state removal.
   */
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

  /**
   * Checks if the cached license data is expired
   */
  isCacheExpired(licenseData) {
    const now = Date.now();
    const cacheExpiryTime = licenseData.validatedAt + this.CACHE_DURATION;
    return now > cacheExpiryTime;
  }

  /**
   * Checks if the license is within the offline grace period
   */
  isWithinGracePeriod(licenseData) {
    const now = Date.now();
    const gracePeriodExpiryTime = licenseData.validatedAt + this.OFFLINE_GRACE_PERIOD;
    return now <= gracePeriodExpiryTime;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LicenseManager;
}