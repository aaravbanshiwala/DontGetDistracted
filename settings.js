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
  const toggle = document.getElementById("dark-mode-toggle");
  if (toggle) {
    toggle.classList.toggle("active", !!darkMode);
  }
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
    // No current count display in new design
  }
});

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
    darkModeToggle.addEventListener("click", () => {
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
    thresholdMinus.addEventListener("click", () => {
      const val = Math.max(1, parseInt(thresholdInput.value, 10) - 1);
      thresholdInput.value = val;
    });
  }

  if (thresholdPlus) {
    thresholdPlus.addEventListener("click", () => {
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

function saveSettings() {
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