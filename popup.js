function applyTheme(darkMode) {
  document.body.classList.toggle("dark", !!darkMode);
}

function formatCount(current, threshold) {
  return `${current} of ${threshold}`;
}

function updateDisplay(settings, currentCount, lastSiteType) {
  const threshold = (settings?.threshold || 10);

  // Update count display
  const countEl = document.getElementById("current-count");
  if (countEl) {
    countEl.textContent = formatCount(currentCount || 0, threshold);
  }

  // Update progress bar
  const progressEl = document.getElementById("progress-bar");
  const percentageEl = document.getElementById("progress-percentage");
  if (progressEl && percentageEl) {
    const percent = Math.min(100, ((currentCount || 0) / threshold) * 100);
    progressEl.style.width = `${percent}%`;
    percentageEl.textContent = `${Math.round(percent)}% (${currentCount || 0}/${threshold})`;
  }

  // Update current site type
  const siteEl = document.getElementById("current-site");
  if (siteEl) {
    siteEl.textContent = lastSiteType ? `Tracking: ${lastSiteType.replace('_', ' ')}` : 'Not tracking';
  }
}

function loadSettings() {
  chrome.storage.local.get(["settings", "currentCount", "lastSiteType"], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading settings:", chrome.runtime.lastError);
      return;
    }
    const settings = data.settings || {};
    applyTheme(settings.darkMode);
    updateDisplay(settings, data.currentCount, data.lastSiteType);
  });
}

// Listen for storage changes to update display in real-time
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  chrome.storage.local.get(["settings", "currentCount", "lastSiteType"], (data) => {
    if (chrome.runtime.lastError) return;
    const settings = data.settings || {};
    
    if (changes.settings) {
      applyTheme(settings.darkMode);
    }
    updateDisplay(settings, data.currentCount, data.lastSiteType);
  });
});

// Refresh every 500ms as backup
setInterval(() => {
  loadSettings();
}, 500);

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  const settingsBtn = document.getElementById("open-settings");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open("settings.html");
      }
    });
  }

  const viewSettingsBtn = document.getElementById("view-settings");
  if (viewSettingsBtn) {
    viewSettingsBtn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open("settings.html");
      }
    });
  }

  const resetBtn = document.getElementById("reset-counter");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "reset_counter" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error resetting counter:", chrome.runtime.lastError);
        }
      });
    });
  }
});