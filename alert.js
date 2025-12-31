// alert.js - Alert page behavior with dismiss + back-to-work actions

function applyTheme(darkMode) {
  document.body.classList.toggle("dark", !!darkMode);
}

document.addEventListener("DOMContentLoaded", () => {
  loadAlert();
  setupAlertListeners();
});

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
    backBtn.addEventListener("click", () => {
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
    dismissBtn.addEventListener("click", () => {
      console.log("[DGD] Dismiss clicked");
      // User dismisses: just close the tab (no snooze in new logic)
      window.close();
    });
  }

  // ESC key closes the alert tab
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.close();
    }
  });
}