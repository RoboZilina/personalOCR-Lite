/**
 * settings.js
 * Modular settings system for VN OCR.
 */

const STORAGE_KEY = "vnocr_settings";

const defaultSettings = {
    ocrMode: "default_mini",      // "default_mini", "adaptive", "paddle", etc.
    autoCapture: true,
    autoCopy: true,
    showHeavyWarning: true,
    theme: "dark",
    historyVisible: true,
    debug: false,
    paddleLineCount: 3
};

let currentSettings = { ...defaultSettings };

/**
 * Loads settings from localStorage with fallback to defaults.
 */
export function loadSettings() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge defaults with parsed to handle missing keys in old versions
            currentSettings = { ...defaultSettings, ...parsed };
        } else {
            currentSettings = { ...defaultSettings };
        }
    } catch (e) {
        console.error("Failed to load settings:", e);
        currentSettings = { ...defaultSettings };
    }
    return currentSettings;
}

/**
 * Persists settings to localStorage.
 */
export function saveSettings(settings) {
    try {
        currentSettings = { ...settings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
}

/**
 * Returns a setting value by key.
 */
export function getSetting(key) {
    if (!(key in defaultSettings)) {
        console.warn(`Attempted to get unknown setting: ${key}`);
    }
    return currentSettings[key];
}

/**
 * Updates a setting value, saves, and returns the new state.
 */
export function setSetting(key, value) {
    if (!(key in defaultSettings)) {
        console.warn(`Attempted to set unknown setting: ${key}`);
    }
    currentSettings[key] = value;
    saveSettings(currentSettings);
    return currentSettings;
}

/**
 * Updates UI elements to reflect current settings.
 */
export function applySettingsToUI() {
    // 1. OCR Mode / Image Process Selector
    const modeSelector = document.querySelector("#mode-selector");
    if (modeSelector) modeSelector.value = currentSettings.ocrMode;

    // 2. Auto-Capture Toggle
    const autoToggle = document.querySelector("#auto-capture-toggle");
    if (autoToggle) {
        autoToggle.checked = currentSettings.autoCapture;
        // Trigger the visual update in UI if there's a label
        const event = new Event('change');
        autoToggle.dispatchEvent(event);
    }

    // 3. Theme Toggle
    if (currentSettings.theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
    const themeBtn = document.querySelector("#menu-theme") || document.querySelector("#theme-toggle");
    if (themeBtn) {
        themeBtn.textContent = 'Toggle Theme';
    }

    // 4. History Visibility
    const root = document.querySelector(".dashboard-root");
    if (root) {
        root.classList.toggle('history-hidden', !currentSettings.historyVisible);
    }

    // Note: showHeavyWarning is used for logic, not a direct UI element usually,
    // but we can bind it if a checkbox exists in a settings menu.
    const warningCheckbox = document.querySelector("#heavy-warning-checkbox");
    if (warningCheckbox) warningCheckbox.checked = !currentSettings.showHeavyWarning;
}

/**
 * Reads UI state and updates settings.
 */
export function applyUIToSettings() {
    const modeSelector = document.querySelector("#mode-selector");
    if (modeSelector) currentSettings.ocrMode = modeSelector.value;

    const autoToggle = document.querySelector("#auto-capture-toggle");
    if (autoToggle) currentSettings.autoCapture = autoToggle.checked;

    const warningCheckbox = document.querySelector("#heavy-warning-checkbox");
    if (warningCheckbox) currentSettings.showHeavyWarning = !warningCheckbox.checked;

    // Theme and history visibility are usually toggled via buttons, 
    // so they are handled directly via setSetting in their click handlers,
    // but we save the whole state here just in case.
    saveSettings(currentSettings);
}
