# Diagnostic Report: UI Initialization Race Condition (v3.1.1 Gold) — RESOLVED

## 📌 Executive Summary
✅ **RESOLVED** — The race condition has been eliminated at the root cause level. DOM element declarations have been reverted to `const` (matching the golden baseline), removing the need for deferred reassignment in `globalInitialize()`.

---

## 🔍 Root Cause Analysis (Historical)

### 1. The Variable Declaration Shift (Fixed)
In the **v3.0 (Lite)** branch, UI variables used `const` — correct and safe:
```javascript
const selectWindowBtn = document.getElementById('select-window-btn'); // OK
```

In the **v3.1.1 (Gold)** branch, these were incorrectly changed to `let` variables, requiring late reassignment in `globalInitialize()`:
```javascript
// BEFORE (broken): let + late reassignment
let selectWindowBtn = document.getElementById('select-window-btn');
// ... inside globalInitialize() ...
selectWindowBtn = document.getElementById('select-window-btn'); // Redundant

// AFTER (fixed): const — no reassignment needed
const selectWindowBtn = document.getElementById('select-window-btn');
```

### 2. The Listener Attachment Gap (Fixed)
With `let` declarations, module-level listeners could attach to `undefined` values if the DOM wasn't ready. With `const`, the declarations execute at module load time and never change. The `DOMContentLoaded` guard ensures `globalInitialize()` runs when the DOM is available.

---

## ✅ Fix Applied (2026-04-23)
1. **All 18 DOM element declarations changed from `let` to `const`** — matching the `GitHub-NoMangaOCR` golden baseline
2. **Removed the "Phase 1" reassignment block** from `globalInitialize()` (18 lines of redundant `document.getElementById` calls)
3. **4 missing features restored**: auto-copy, modeSelector listener, speakLatestBtn handler, historyItem delegation
4. **Safety improvements preserved**: TTS fallback poll, `drawSelectionRect` stub, diagnostic tracking, structured init functions

The `initEventListeners_Part3()` encapsulation now references `const` variables, making it a safety net rather than a workaround.

---

## ⚖️ Comparison with `GitHub-NoMangaOCR`
The `main` branch is now architecturally aligned with the `GitHub-NoMangaOCR` golden baseline (both use `const` DOM declarations) while retaining additional safety improvements and modular structure.

**Status**: ✅ Fully Resolved.
