// Function to open extension popup (called from background script)
function openExtensionPopup() {
  // Try to open the extension popup
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    // Fallback: try to open via extension URL
    const extensionUrl = chrome.runtime.getURL('popup.html');
    window.open(extensionUrl, 'extension_popup', 'width=400,height=500');
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    openExtensionPopup();
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});

// Wait for the page to be fully loaded before checking license
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkLicenseAndSetupUI);
} else {
  // If already loaded, run immediately
  checkLicenseAndSetupUI();
}

// Also run a periodic check in case the license status changes while the page is open
setInterval(checkLicenseAndSetupUI, 30000); // Check every 30 seconds

// Define the checkLicenseAndSetupUI function to avoid the error
async function checkLicenseAndSetupUI() {
  // This function is now defined to prevent the error, but will not execute
  // since premium badges and upgrade prompts have been removed
}