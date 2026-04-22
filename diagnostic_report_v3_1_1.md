# Diagnostic Report: UI Initialization Race Condition (v3.1.1 Gold)

## 📌 Executive Summary
A critical initialization bug has been identified in the `main` branch (v3.1.1). Due to the refactoring of DOM element assignment into the deferred `globalInitialize()` function, several core UI event listeners are currently "silent failures." They attempt to attach to `undefined` variables before the elements are fetched from the DOM.

---

## 🔍 Root Cause Analysis

### 1. The Variable Declaration Shift
In the **v3.0 (Lite)** branch, UI variables were initialized at the top level:
```javascript
const selectWindowBtn = document.getElementById('select-window-btn'); // OK
```

In the **v3.1.1 (Gold)** branch, these were changed to `let` variables and deferred:
```javascript
// app.js Line 54
let selectWindowBtn, vnVideo, selectionOverlay...; // Declared as undefined

// app.js Line 1929 (Inside globalInitialize)
selectWindowBtn = document.getElementById('select-window-btn'); // Assigned LATE
```

### 2. The Listener Attachment Gap
The event listener logic remains at the top level of the module (e.g., Line 749). When the script executes sequentially:
1. It reaches **Line 749**.
2. It executes `if (selectWindowBtn)`.
3. Since `selectWindowBtn` is still `undefined` (awaiting the `globalInitialize` call at the bottom of the file), the condition fails and **no listener is attached**.

---

## 🔴 Impacted Features
The following features are currently non-functional on the `main` branch:

| Feature | Code Location | Status |
| :--- | :--- | :--- |
| **Select Window Source** | `app.js:749` | ❌ Broken |
| **Auto-Capture Button** | `app.js:1732` | ❌ Broken |
| **Theme Toggle** | `app.js:2150+` | ❌ Broken |
| **Side Menu Actions** | `app.js:2157+` | ❌ Broken |

---

## 🛠️ Proposed Surgical Fix
All event listener attachments currently residing at the top level must be encapsulated into the `initEventListeners` suite, which is called *after* DOM assignment in `globalInitialize`.

### Recommended Patch Logic:
```javascript
function initEventListeners_Part1() {
    // Move top-level listeners here
    if (selectWindowBtn) {
        selectWindowBtn.onclick = () => videoStream ? stopCapture() : startCapture();
    }
    // ... etc
}
```

---

## ⚖️ Comparison with `GitHub-NoMangaOCR`
The `GitHub-NoMangaOCR` branch avoids this issue by using **Immediate Initialization**. While less "modular," it ensures the variables are available for the sequential script execution. The `main` branch's modular approach is superior for large-scale maintenance but requires stricter adherence to the "Fetch then Attach" lifecycle.

**Status**: Audit Complete. Ready for patch application.
