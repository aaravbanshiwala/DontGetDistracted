function applyTheme(darkMode) {
  document.body.classList.toggle("dark", !!darkMode);
}

function updateDisplay(settings, currentCount, lastSiteType) {
  const threshold = settings?.threshold || 10;

  // Update counter display
  const counterEl = document.getElementById("current-count");
  if (counterEl) {
    counterEl.textContent = currentCount || 0;
  }

  // Update threshold display
  const thresholdEl = document.getElementById("threshold-display");
  if (thresholdEl) {
    thresholdEl.textContent = threshold;
  }

  // Update progress bar
  const progressEl = document.getElementById("progress-bar");
  if (progressEl) {
    const percent = Math.min(100, ((currentCount || 0) / threshold) * 100);
    progressEl.style.width = `${percent}%`;
  }

  // Update current site tracking
  const siteEl = document.getElementById("current-site");
  if (siteEl) {
    siteEl.textContent = lastSiteType || "None";
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

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  const btn = document.getElementById("open-settings");
  if (btn) {
    btn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open("settings.html");
      }
    });
  }
});
