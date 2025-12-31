// settings.js - Settings page logic with dark mode support

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

function applyTheme(darkMode) {
  document.body.classList.toggle("dark", !!darkMode);
}

// Load settings on page load
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  setupEventListeners();
});

// Keep status section in sync when background updates storage
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (Object.prototype.hasOwnProperty.call(changes, "currentCount")) {
    const countEl = document.getElementById("currentCount");
    if (countEl) {
      const val = changes.currentCount.newValue;
      countEl.textContent = String(typeof val === "number" ? val : 0);
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, "snoozeCountRemaining")) {
    const snoozeEl = document.getElementById("snoozeRemaining");
    if (snoozeEl) {
      const val = changes.snoozeCountRemaining.newValue;
      snoozeEl.textContent = String(typeof val === "number" ? val : 0);
    }
  }
});

function loadSettings() {
  chrome.storage.local.get(["settings", "currentCount", "snoozeCountRemaining"], (data) => {
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

    // Apply dark mode checkbox + theme
    const darkModeCheckbox = document.getElementById("darkMode");
    if (darkModeCheckbox) {
      darkModeCheckbox.checked = !!settings.darkMode;
    }
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

    // Show current consecutive count if present
    const countEl = document.getElementById("currentCount");
    if (countEl) {
      const count = typeof data.currentCount === "number" ? data.currentCount : 0;
      countEl.textContent = String(count);
    }

    // Show snooze remaining if present
    const snoozeEl = document.getElementById("snoozeRemaining");
    if (snoozeEl) {
      const val = typeof data.snoozeCountRemaining === "number" ? data.snoozeCountRemaining : 0;
      snoozeEl.textContent = String(val);
    }
  });
}

function setupEventListeners() {
  // Dark mode toggle
  const darkModeCheckbox = document.getElementById("darkMode");
  if (darkModeCheckbox) {
    darkModeCheckbox.addEventListener("change", (e) => {
      const isDark = e.target.checked;
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

  // Reset counter button
  const resetCounterBtn = document.getElementById("reset-counter");
  if (resetCounterBtn) {
    resetCounterBtn.addEventListener("click", resetCounter);
  }

  // Test alert button
  const testAlertBtn = document.getElementById("test-alert");
  if (testAlertBtn) {
    testAlertBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "test_alert" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error testing alert:", chrome.runtime.lastError);
          alert("Error: " + chrome.runtime.lastError.message);
        }
      });
    });
  }

  // Optional reset button (only if added to DOM in the future)
  const resetButton = document.getElementById("reset");
  if (resetButton) {
    resetButton.addEventListener("click", resetToDefaults);
  }
}

function saveSettings() {
  const alertMessageEl = document.getElementById("alertMessage");
  const thresholdEl = document.getElementById("threshold");
  const darkModeEl = document.getElementById("darkMode");

  const alertMessage = alertMessageEl ? alertMessageEl.value.trim() : DEFAULT_SETTINGS.alertMessage;
  const threshold = thresholdEl ? Math.max(1, parseInt(thresholdEl.value, 10) || DEFAULT_SETTINGS.threshold) : DEFAULT_SETTINGS.threshold;
  const darkMode = darkModeEl ? darkModeEl.checked : false;

  chrome.storage.local.get(["settings"], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error reading settings:", chrome.runtime.lastError);
      showSaved("Error!");
      return;
    }

    const oldSettings = data.settings || DEFAULT_SETTINGS;

    // Get tracked sites from DOM
    const siteElements = document.querySelectorAll(".site-item");
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
    siteDiv.className = "site-item";
    siteDiv.innerHTML = `
      <input type="text" class="site-pattern" value="${site.pattern}" placeholder="example.com/*">
      <label class="toggle-label">
        <input type="checkbox" class="site-enabled" ${site.enabled ? "checked" : ""}>
        <span>Enabled</span>
      </label>
      <button class="remove-btn" data-index="${index}">Remove</button>
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

function addNewSite() {
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

function removeSite(index) {
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

function resetToDefaults() {
  if (confirm("Reset all settings to defaults?")) {
    chrome.storage.local.set(
      {
        settings: DEFAULT_SETTINGS,
        currentCount: 0,
        lastSiteType: null,
        snoozeCountRemaining: 0
      },
      () => {
        loadSettings();
        showSaved("Reset to defaults!");
      }
    );
  }
}

function resetCounter() {
  chrome.runtime.sendMessage({ type: "reset_counter" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error resetting counter:", chrome.runtime.lastError);
      return;
    }
    // Update display
    const countEl = document.getElementById("currentCount");
    if (countEl) countEl.textContent = "0";
    const snoozeEl = document.getElementById("snoozeRemaining");
    if (snoozeEl) snoozeEl.textContent = "0";
    showSaved("Reset!");
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
