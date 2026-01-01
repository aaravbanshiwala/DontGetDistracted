// popup.js - Fixed version with proper null checks and single licenseManager

// Initialize LicenseManager once
const licenseManager = new LicenseManager();

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
  // License activation elements
  const validView = document.getElementById('valid-view');
  const invalidView = document.getElementById('invalid-view');
  const maskedLicenseKey = document.getElementById('masked-license-key');
  const licenseKeyInput = document.getElementById('license-key-input');
  const activateBtn = document.getElementById('activate-btn');
  const activateBtnText = document.getElementById('activate-btn-text');
  const activateSpinner = document.getElementById('activate-spinner');
  const deactivateBtn = document.getElementById('deactivate-btn');
  const messageDiv = document.getElementById('message');

  // Dashboard elements
  const viewSettingsBtn = document.getElementById('view-settings');
  const resetBtn = document.getElementById('reset-btn');

  // Helper functions
  function showView(viewId) {
    if (validView && invalidView) {
      validView.classList.add('hidden');
      invalidView.classList.add('hidden');
      
      if (viewId === 'valid') {
        validView.classList.remove('hidden');
      } else if (viewId === 'invalid') {
        invalidView.classList.remove('hidden');
      }
    }
  }

  function showMessage(message, type) {
    if (messageDiv) {
      messageDiv.textContent = message;
      messageDiv.className = `message ${type}`;
      messageDiv.classList.remove('hidden');
    }
  }

  function hideMessage() {
    if (messageDiv) {
      messageDiv.classList.add('hidden');
    }
  }

  function maskLicenseKey(key) {
    if (!key || key.length < 8) return key;
    const start = key.substring(0, 4);
    const end = key.substring(key.length - 4);
    return `${start}...${end}`;
  }

  function showSpinner() {
    if (activateBtnText && activateSpinner && activateBtn) {
      activateBtnText.style.display = 'none';
      activateSpinner.classList.remove('hidden');
      activateBtn.disabled = true;
    }
  }

  function hideSpinner() {
    if (activateBtnText && activateSpinner && activateBtn) {
      activateBtnText.style.display = 'inline';
      activateSpinner.classList.add('hidden');
      activateBtn.disabled = false;
    }
  }

  function applyTheme(darkMode) {
    document.body.classList.toggle('dark', !!darkMode);
  }

  function formatCount(current, threshold) {
    return `${current} of ${threshold}`;
  }

  function updateDisplay(settings, currentCount, lastSiteType) {
    const threshold = settings?.threshold || 10;

    // Update count display
    const countEl = document.getElementById('current-count');
    if (countEl) {
      countEl.textContent = formatCount(currentCount || 0, threshold);
    }

    // Update progress bar
    const progressEl = document.getElementById('progress-bar');
    const percentageEl = document.getElementById('progress-percentage');
    if (progressEl && percentageEl) {
      const percent = Math.min(100, ((currentCount || 0) / threshold) * 100);
      progressEl.style.width = `${percent}%`;
      percentageEl.textContent = `${Math.round(percent)}% (${currentCount || 0}/${threshold})`;
    }

    // Update current site type
    const siteEl = document.getElementById('current-site');
    if (siteEl) {
      siteEl.textContent = lastSiteType 
        ? `Tracking: ${lastSiteType.replace('_', ' ')}` 
        : 'Not tracking';
    }
  }

  function loadSettings() {
    chrome.storage.local.get(['settings', 'currentCount', 'lastSiteType'], (data) => {
      if (chrome.runtime.lastError) {
        console.error('Error loading settings:', chrome.runtime.lastError);
        return;
      }
      const settings = data.settings || {};
      applyTheme(settings.darkMode);
      updateDisplay(settings, data.currentCount, data.lastSiteType);
    });
  }

  // Initialize license check
  async function initLicense() {
    try {
      const hasValid = await licenseManager.hasValidLicense();
      const storedLicense = await licenseManager.getStoredLicense();
      
      if (hasValid && storedLicense) {
        showView('valid');
        if (maskedLicenseKey) {
          maskedLicenseKey.textContent = maskLicenseKey(storedLicense.key);
        }
      } else {
        showView('invalid');
      }
    } catch (error) {
      console.error('License initialization error:', error);
      showView('invalid');
    }
  }

  // Event Listeners - License Activation
  if (activateBtn) {
    activateBtn.addEventListener('click', async () => {
      const licenseKey = licenseKeyInput?.value.trim();
      
      if (!licenseKey) {
        showMessage('Please enter a license key', 'error');
        return;
      }
      
      showSpinner();
      hideMessage();
      
      try {
        const result = await licenseManager.validateLicenseKey(licenseKey);
        
        if (result.valid) {
          showMessage('License activated successfully!', 'success');
          if (maskedLicenseKey) {
            maskedLicenseKey.textContent = maskLicenseKey(licenseKey);
          }
          setTimeout(() => {
            showView('valid');
          }, 1500);
        } else {
          showMessage(result.message || 'Invalid license key', 'error');
        }
      } catch (error) {
        console.error('Activation error:', error);
        showMessage('An error occurred during activation', 'error');
      } finally {
        hideSpinner();
      }
    });
  }

  // ✅ FIXED: Reset / Deactivate Button — Local-only + redirect to Whop dashboard
  if (deactivateBtn) {
    deactivateBtn.addEventListener('click', async () => {
      // Always show confirmation
      if (!confirm('This will clear your license locally and open the Whop dashboard.\n\nTo fully reset or reassign your license, use the Whop dashboard afterward.\n\nContinue?')) {
        return;
      }

      try {
        // 1. Clear local license state only
        await licenseManager.clearLicense();

        // 2. Reset UI to license key entry state
        showView('invalid');
        if (licenseKeyInput) licenseKeyInput.value = '';
        if (maskedLicenseKey) maskedLicenseKey.textContent = '';

        showMessage('License cleared locally. Opening Whop dashboard...', 'info');

        // 3. Open Whop dashboard in new tab
        chrome.tabs.create({ url: 'https://whop.com/dgd-extension' });

        // Optional: auto-hide message after 3s
        setTimeout(() => hideMessage(), 3000);
      } catch (error) {
        console.error('Failed to clear license locally:', error);
        showMessage('Failed to clear license. Try again.', 'error');
      }
    });
  }

// ✅ Settings Button — Opens settings.html
const settingsBtn = document.getElementById('settings-btn'); // ← corrected ID
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    // Prefer chrome.runtime.openOptionsPage if settings.html is registered as options_page
    // Otherwise, open directly in new tab (more reliable for Manifest V3)
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });
}
  // ✅ Reset License on Whop button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://whop.com/dgd-extension' });
    });
  }

  if (viewSettingsBtn) {
    viewSettingsBtn.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('settings.html');
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'reset_counter' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error resetting counter:', chrome.runtime.lastError);
        }
      });
    });
  }



  // Initialize everything
  await initLicense();
  loadSettings();

  // Listen for storage changes to update display in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    chrome.storage.local.get(['settings', 'currentCount', 'lastSiteType'], (data) => {
      if (chrome.runtime.lastError) return;
      const settings = data.settings || {};
      
      if (changes.settings) {
        applyTheme(settings.darkMode);
      }
      updateDisplay(settings, data.currentCount, data.lastSiteType);
    });
  });

  // Refresh every 500ms as backup for dashboard updates
  setInterval(() => {
    loadSettings();
  }, 500);
});
