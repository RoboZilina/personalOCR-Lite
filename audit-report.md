# VN OCR — Combined Audit Report

**Codebase:** `vn-ocr-public-deployOpus2/vn-ocr-public-deployOpus/`
**Files audited:** `index.html`, `app.js`, `settings.js`, `styles.css`, `service-worker.js`, `manifest.json`
**Date:** April 8, 2026

---

# Part 1 — Pre-Deployment Audit

## Summary Verdict

### PASS WITH WARNINGS

The codebase is functionally stable across all primary paths: OCR pipeline, capture loop, history, TTS, theme, settings persistence, and side menu. No duplicate declarations, no circular initialization, no broken flows, and no logic regressions were found. Two specific bugs were identified — one critical (service worker pre-cache omission of `settings.js`) and one major (PaddleOCR warning checkbox polarity inversion). Neither affects core OCR or capture functionality, but both should be resolved before merge for production reliability.

---

## 1. Syntax & Module Integrity

- **No syntax errors** in `app.js` or `settings.js`. Both files parse cleanly as ES modules.
- **No duplicate function declarations.** Every function name is unique.
- **No unreachable code.** All code paths are reachable.
- **No accidental global variables.** All variables are module-scoped or block-scoped. `window.onmousemove` etc. are intentional property assignments.
- **No circular imports.** `app.js` imports from `settings.js`; `settings.js` imports nothing.
- **No missing DOM selectors.** All `getElementById` / `querySelector` calls match elements in `index.html`.
- **No broken initialization order.** `globalInitialize()` runs once at module end; settings load before UI sync.

---

## 2. Initialization Order

- `globalInitialize()` runs **exactly once**, at the end of `app.js` module evaluation.
- `initSettings()` calls `loadSettings()` → `applySettingsToUI()` in the correct order.
- Settings load from `localStorage` before UI sync; UI sync does not overwrite user state.
- Event listeners attach during module evaluation, which occurs after DOM is parsed (the `<script>` is at the bottom of `<body>` with `type="module"`).
- No circular initialization occurs.

---

## 3. Event Listener Integrity

- **No duplicate listeners.** Each handler is attached once.
- **No missing listeners.** All interactive elements in `index.html` have corresponding handlers in `app.js`.
- **No listeners on wrong selectors.** All `getElementById` targets match HTML `id` attributes.
- **No conditionally skipped listeners.** All critical listeners use optional chaining (`?.addEventListener`) for safety, never conditional blocks that might not execute.
- **No listener override conflicts** — except the minor note that `window.onmousemove`, `window.onmouseup`, `window.onclick`, and `window.onkeydown` use property assignment rather than `addEventListener`. Currently no internal conflict, but vulnerable to external override.

---

## 4. Settings System

- `applySettingsToUI()` covers: `ocrMode`, `autoCapture`, `theme`, `historyVisible`, `showHeavyWarning`.
- `autoCopy` is handled directly via `setSetting` in the menu handler — not in `applySettingsToUI()` — which is correct since it has no direct DOM representation beyond the menu button label.
- **No settings keys have drifted.** `defaultSettings` matches all UI elements.
- History visibility toggles `.history-hidden` on `.dashboard-root` — correct.
- Theme toggle sets/removes `light-theme` on `<body>` — correct.
- Auto-capture guard clears existing interval before setting a new one — no duplication.
- **Defect (M1):** `heavy-warning-checkbox` polarity is inverted in `applySettingsToUI()`. See Critical/Major Issues below.

---

## 5. UI Consistency

- **Menu:** opens on `☰` click, closes on backdrop click and Escape. All 6 menu actions (theme, auto, copy, install, history, guide) fire correctly and close the menu afterward.
- **Modal logic:** Help modal and PaddleOCR modal both open/close correctly via `.active` class. Cancel on PaddleOCR modal restores `previousMode`. Clicking outside help modal or pressing Escape closes it.
- **Startup banner:** `position: relative` in document flow — does not overlap capture region.
- **Window source selector:** `#select-window-btn` is in `.header-right`, always reachable. Toggles between start/stop capture correctly.
- **TTS dropdown:** wired to `loadVoices()` function, populates Japanese voices, `speak()` uses selected voice. `🔊` buttons on latest text and history items both work via delegated click handler.
- **Mode selector revert:** Cancel handler on PaddleOCR modal sets `engineSelector.value = previousMode` without dispatching a `change` event — correct.

---

## 6. CSS Layout Integrity

- `.history-hidden .history-sidebar { display: none !important; }` — correctly collapses the sidebar.
- `.history-hidden .app-main { grid-template-columns: 1fr !important; }` — correctly adjusts the grid.
- `.startup-banner` uses `position: relative` — correct, no overlap with capture region.
- No CSS rules override critical layout unintentionally.
- No accidental `pointer-events: none` on interactive elements.
- z-index hierarchy is logical: modals (9999) > side menu (5000) > menu backdrop (4000) > selection hint (500) > header (100) > startup banner (80) > transcription tray (50).

---

## 7. OCR & Capture Pipeline (Audit Only — No Modifications)

- All 9 image processing modes are present and handled: `default_mini`, `default_full`, `adaptive`, `paddle`, `multi`, `last_resort`, `binarize`, `grayscale`, `raw`.
- OCR mode switching is intact — `engineSelector` change handler routes correctly.
- Capture loop: 32×32 scout comparison → 10-pixel diff threshold → 800ms stability delay → `captureFrame()`. Guards on `!videoStream`, `!selectionRect`, `isProcessing` prevent misfires.
- Tesseract worker lifecycle: `ensureModelLoaded()` creates/terminates workers correctly, with fallback from failed model to `jpn`.
- Canvas extraction: `drawImage` from video uses proper bounds clamping within `captureFrame()`.
- `captureGeneration` counter prevents stale results from overwriting newer ones.
- **No accidental changes detected** to any of the above systems.

---

## 8. Console & Logging

- **Leftover debug log:** `loadPaddleOCR()` at `app.js:919` has an unconditional `console.log("[VN-OCR] PaddleOCR lazy-load placeholder triggered.")`. Not gated by `getSetting('debug')`.
- `denormalizeSelection` has a conditional `console.debug` guarded by `getSetting('debug')` — acceptable.
- No noisy console output beyond the above.
- No logs that leak internal state, settings values, or image data.

---

## 9. Regression Detection

- **No missing features** compared to expected functionality.
- **No broken flows.** All user paths (capture, OCR, history, TTS, settings, menu, modal, banner) are functional.
- **No UI regressions.** Layout is consistent across all states.
- **No logic regressions.** Settings persist, auto-capture toggles correctly, mode switching works.
- **No initialization regressions.** `globalInitialize()` runs exactly once, in the correct order.

---

## Critical Issues (must fix before merge)

### C1. `settings.js` missing from service worker pre-cache ASSETS list

**File:** `service-worker.js`, lines 5–11

The `ASSETS` array pre-caches `index.html`, `styles.css`, `app.js`, and `manifest.json` — but omits `settings.js`. Since `app.js` imports `settings.js` as an ES module, the module will fail to resolve when offline if the user's first visit didn't runtime-cache it through the stale-while-revalidate fetch handler. **The entire app will break offline on first-install-and-go-offline scenarios.**

**Fix:** Add `'./settings.js'` to the `ASSETS` array.

---

## Major Issues (should fix before merge)

### M1. `heavy-warning-checkbox` polarity inversion in `applySettingsToUI()`

**File:** `settings.js`, lines 100–101

```js
const warningCheckbox = document.querySelector("#heavy-warning-checkbox");
if (warningCheckbox) warningCheckbox.checked = currentSettings.showHeavyWarning;
```

The label reads **"Do not show this warning again"**, but the code sets `checked = showHeavyWarning`. Default `showHeavyWarning` is `true` → checkbox appears **pre-checked** → visually implies the user wants to suppress the warning.

**Impact path:** User selects PaddleOCR → modal appears with checkbox already checked → user clicks Continue → Continue handler reads `checked === true` → calls `setSetting('showHeavyWarning', false)` → warning permanently disabled without user intent.

The banner close checkbox (`app.js:959`) does it correctly (`!e.target.checked`), confirming the inversion is unintentional.

**Fix:** Change to `warningCheckbox.checked = !currentSettings.showHeavyWarning`.

---

## Minor Issues (optional)

### m1. Leftover debug `console.log` in `loadPaddleOCR()`

**File:** `app.js`, line 919 — unconditional `console.log`. Should be removed or guarded by `getSetting('debug')`.

### m2. `autoToggle.nextElementSibling` targets wrong element

**File:** `app.js`, line 270 — the `autoToggle` (`#auto-capture-toggle`) is inside a hidden `<div>` in the header. Its `nextElementSibling` is `#install-btn`, not a label. The `onchange` handler writes text to the install button. **No visible effect** because the parent is `display:none`, and the actual AUTO button text is driven by CSS `:has()`.

### m3. `refreshOcrBtn` used without null guard

**File:** `app.js`, lines 244 and 890 — every other DOM element is guarded with `if (element)`, but `refreshOcrBtn` is not. Not an active bug since the element exists in HTML, but inconsistent.

### m4. Global event handlers via property assignment

**File:** `app.js`, lines 229–230 and 881–882 — `window.onmousemove`, `window.onmouseup`, `window.onclick`, and `window.onkeydown` use property assignment. Any future code or browser extension that assigns these would silently replace the handlers.

### m5. Service worker ASSETS missing icon files

**File:** `service-worker.js`, lines 5–11 — `icon-192.png` and `icon-512.png` (referenced in `manifest.json`) are not pre-cached. Icons would fail to load offline on first install only.

---

## Stability Assessment

| System | Status | Notes |
|---|---|---|
| Initialization | Stable | `globalInitialize()` runs exactly once. Settings load before UI sync. No circular dependencies. |
| Event listeners | Stable | No duplicates. Delegated click handling on history is clean. All modal/menu handlers paired. |
| UI behavior | Stable | Menu open/close, modal open/close/cancel, banner show/hide all function correctly. |
| Settings sync | Stable (with M1 caveat) | All keys synced. Checkbox polarity is the only defect. |
| Layout | Stable | `.history-hidden` collapses grid. Banner in flow. z-index hierarchy correct. |
| OCR pipeline | Frozen / Intact | All 9 modes handled. Worker lifecycle correct. Fallback works. |
| Capture loop | Frozen / Intact | 32×32 scout → stability delay → capture. Guards prevent misfires. Timer cleanup correct. |

## Merge Readiness Score: 7 / 10

Core functionality is fully stable with no regressions. C1 only affects offline/PWA first-install scenarios. M1 has a narrow but real impact path. Minor issues are cosmetic or defensive-coding inconsistencies. Raising to 8–9 requires fixing C1 and M1.

## Final Recommendation

### Hold merge — fix C1 and M1 first.

Adding `'./settings.js'` to the service worker `ASSETS` array (C1) is a one-line fix. Inverting the checkbox sync (M1) is also a one-line fix. Both carry zero regression risk. Once applied, this codebase is safe to merge.

---
---

# Part 2 — PaddleOCR Integration Readiness Checklist

## Overview

This section evaluates whether the current codebase is architecturally ready to accept a PaddleOCR integration. It assesses every layer — from baseline stability through model infrastructure to pipeline branching — and identifies exactly what exists, what's missing, and what must be built.

---

## 1. Baseline Stability (Must Be 100% Clean Before Integration)

### 1.1 JavaScript Module Integrity

| Check | Status |
|---|---|
| No syntax errors in app.js or settings.js | ✅ PASS |
| No duplicate function declarations | ✅ PASS |
| No unreachable code | ✅ PASS |
| No accidental global variables | ✅ PASS |
| No circular imports | ✅ PASS |
| No missing DOM selectors | ✅ PASS |
| No broken initialization order | ✅ PASS |

### 1.2 UI Stability

| Check | Status | Notes |
|---|---|---|
| Menu opens/closes correctly | ✅ PASS | |
| Mode selector works and reverts correctly | ✅ PASS | |
| PaddleOCR modal opens and cancels correctly | ✅ PASS | |
| Banner does not overlap capture region | ✅ PASS | `position: relative` in flow |
| History panel collapses correctly | ✅ PASS | |
| Theme toggle displays emoji + text | ⚠️ WARN | Text is always `'Toggle Theme'`, no emoji state indicator. Existing behavior, not a regression |

### 1.3 Capture Loop Stability

| Check | Status |
|---|---|
| Manual capture works | ✅ PASS |
| Auto-capture works, no timer duplication | ✅ PASS |
| Canvas extraction returns correct pixel data | ✅ PASS |
| No race conditions between capture and UI | ✅ PASS |

### 1.4 OCR Pipeline Stability

| Check | Status | Notes |
|---|---|---|
| Default Tesseract pipeline works | ✅ PASS | |
| No silent exceptions | ✅ PASS | |
| No stuck "Loading…" states | ✅ PASS | |
| No leftover debug logs | ⚠️ WARN | 1 unconditional `console.log` in `loadPaddleOCR()` |

---

## 2. Settings System Readiness

### 2.1 Settings Schema

| Check | Status | Notes |
|---|---|---|
| `ocrMode` includes "paddle" | ✅ PASS | HTML has `<option value="paddle">`; schema accepts any stored value via merge |
| `previousMode` logic is correct | ✅ PASS | Initialized from `engineSelector.value`, updated after change |
| No drift between UI and settings keys | ⚠️ MINOR | `previousMode` initializes from HTML default, not stored settings. If stored mode is `"adaptive"`, `previousMode` starts as `"default_mini"` until first change event |

### 2.2 UI Sync

| Check | Status | Notes |
|---|---|---|
| `applySettingsToUI()` does not overwrite user state | ✅ PASS | Only runs at startup |
| Mode selector reflects actual mode | ✅ PASS | |
| PaddleOCR mode triggers modal, not pipeline | ✅ PASS | |
| Cancel restores previous mode without extra events | ✅ PASS | |
| Warning checkbox polarity | ❌ BUG | Should be `!currentSettings.showHeavyWarning` — see Part 1, M1 |

### 2.3 Persistence

| Check | Status |
|---|---|
| Settings persist across reloads | ✅ PASS |
| No JSON parse errors | ✅ PASS |
| No missing keys in stored settings | ✅ PASS |

---

## 3. UI/UX Readiness for PaddleOCR

### 3.1 Modal

| Check | Status |
|---|---|
| PaddleOCR warning modal is functional | ✅ PASS |
| Cancel restores previous mode | ✅ PASS |
| Confirm sets mode to "paddle" | ✅ PASS |
| No double event firing | ✅ PASS |

### 3.2 Status Indicators

| Check | Status | Notes |
|---|---|---|
| Status pill supports "Loading PaddleOCR…" | ❌ NOT READY | `loadPaddleOCR()` jumps straight to ready — no loading state |
| Status pill supports "PaddleOCR Ready" | ⚠️ PARTIAL | Placeholder text `'🟢 PaddleOCR Placeholder'` exists but is not the final string |
| Status pill supports "PaddleOCR Error" | ❌ NOT READY | No error path in placeholder |

### 3.3 Error Surfaces

| Check | Status |
|---|---|
| ONNX load failures surface cleanly | ❌ NOT READY |
| No silent failures | ❌ NOT READY |
| No infinite "loading" states | ⚠️ CONCERN (placeholder skips loading, but real impl must handle timeouts) |

---

## 4. File & Model Infrastructure Readiness

### 4.1 Model File Placement

| File | Status |
|---|---|
| Detection model (`det.onnx`) | ❌ MISSING |
| Recognition model (`rec.onnx`) | ❌ MISSING |
| Dictionary file (`keys.txt`) | ❌ MISSING |
| Predictable folder (`/models/paddle/`) | ❌ MISSING — flat structure, no models directory |

### 4.2 Fetch Readiness

| Check | Status | Notes |
|---|---|---|
| Server serves `.onnx` with correct MIME type | ❌ NOT CONFIGURED | No server config in repo |
| No CORS issues | ⚠️ UNKNOWN | Depends on hosting; CSP does not whitelist any ONNX host |
| No `file://` loading | ✅ OK | |
| No path mismatches | N/A | No model paths defined yet |

### 4.3 ONNX Runtime Readiness

| Check | Status | Notes |
|---|---|---|
| ONNX Runtime Web available | ❌ NOT LOADED | No `<script>` tag for `ort.min.js` or `onnxruntime-web` in `index.html` |
| WebAssembly backend supported | ⚠️ ASSUMED | Target browsers support WASM, but no runtime check in code |
| WebGPU fallback | N/A | Optional |

---

## 5. Pipeline Integration Readiness

### 5.1 Capture → PaddleOCR Pipeline

| Check | Status | Notes |
|---|---|---|
| `captureFrame()` branches on mode | ❌ NOT READY | `captureFrame()` handles `last_resort`, `multi`, and all others — **no `paddle` branch exists**. If mode is `"paddle"`, it falls through to the default Tesseract path. PaddleOCR would never execute. |

### 5.2 Preprocessing Compatibility

| Check | Status | Notes |
|---|---|---|
| Output is grayscale or RGB | ✅ READY | Canvases are opaque RGB |
| Correct orientation/cropping/scaling | ✅ READY | `denormalizeSelection` + clamp logic is correct |
| No alpha channel issues | ✅ READY | |
| No canvas tainting | ✅ PASS | `getDisplayMedia` source is same-origin |

### 5.3 Result Mapping

| Check | Status | Notes |
|---|---|---|
| PaddleOCR result mapping exists | ❌ NOT READY | No code maps PaddleOCR output (bboxes, text, confidence) to `addOCRResultToUI()`. The existing function expects a plain text string |

---

## 6. Performance & Memory Readiness

### 6.1 Model Size

| Check | Status |
|---|---|
| Total model size confirmed | ❌ UNKNOWN — no models present (JP PaddleOCR models are typically 20–80 MB combined) |
| Load time acceptable | ❌ UNKNOWN |

### 6.2 Memory Footprint

| Check | Status |
|---|---|
| Memory limits checked | ❌ NOT TESTED |
| No memory leaks in repeated inference | ❌ NOT TESTED |

### 6.3 Auto-Capture Interaction

| Check | Status | Notes |
|---|---|---|
| Guard against inference overlap | ✅ READY | `isProcessing` flag in `captureFrame()` and `checkAutoCapture()` already prevents concurrent inference. Will naturally protect PaddleOCR if the paddle pipeline sets/clears `isProcessing` |

---

## 7. Error Handling Readiness

### 7.1 ONNX Load Errors

| Scenario | Status |
|---|---|
| Missing model | ❌ NOT HANDLED |
| Wrong path | ❌ NOT HANDLED |
| Wrong MIME type | ❌ NOT HANDLED |
| Corrupted model | ❌ NOT HANDLED |

### 7.2 Inference Errors

| Scenario | Status |
|---|---|
| Invalid tensor shape | ❌ NOT HANDLED |
| Unexpected input format | ❌ NOT HANDLED |
| WASM backend failure | ❌ NOT HANDLED |

### 7.3 UI Recovery

| Check | Status | Notes |
|---|---|---|
| Status pill shows error | ⚠️ PARTIAL | `setOCRStatus('error', ...)` infrastructure exists but no paddle-specific error path calls it |
| Mode selector remains functional | ✅ PASS | |
| App does not freeze | ✅ PASS | `finally { isProcessing = false }` ensures recovery |

---

## 8. Logging & Diagnostics Readiness

### 8.1 Remove Debug Logs

| Check | Status | Notes |
|---|---|---|
| No leftover `console.log` | ❌ FAIL | `loadPaddleOCR()` has unconditional `console.log` |
| No verbose ONNX logs | ✅ PASS | No ONNX runtime loaded yet |
| No debug prints in capture loop | ✅ PASS | Debug log gated by `getSetting('debug')` |

### 8.2 Add Minimal Diagnostics

| Check | Status |
|---|---|
| Model load success/failure logging | ❌ NOT READY |
| Inference start/end/error logging | ❌ NOT READY |

### 8.3 No Sensitive Logging

| Check | Status |
|---|---|
| No logging of image data | ✅ PASS |
| No logging of user settings | ✅ PASS |
| No logging of internal state | ✅ PASS |

---

## 9. Deployment Readiness

### 9.1 HTTP Serving

| Check | Status |
|---|---|
| Runs under HTTP/HTTPS | ✅ PASS |
| No `file://` model loading | ✅ PASS |

### 9.2 Folder Structure

| Required | Status |
|---|---|
| `/models/paddle/` | ❌ MISSING |
| JS at root | ✅ OK (acceptable for project scale) |
| CSS at root | ✅ OK |

### 9.3 Browser Compatibility

| Browser | Status | Notes |
|---|---|---|
| Chrome | ✅ PASS | `getDisplayMedia`, ES modules, `:has()` CSS all supported |
| Edge | ✅ PASS | Chromium-based |
| Firefox | ⚠️ PARTIAL | CSS `:has()` since Firefox 121. WASM ONNX should work |

### 9.4 Content Security Policy

| Check | Status | Notes |
|---|---|---|
| CSP allows ONNX model fetch | ❌ BLOCKING | `connect-src` only whitelists `'self'`, `cdn.jsdelivr.net`, `fastly.jsdelivr.net`, `tessdata.projectnaptha.com`. Must update if models are hosted externally. Self-hosted models covered by `'self'` |
| CSP allows WASM execution | ⚠️ CONCERN | No `script-src` directive set (browser default applies). ONNX Runtime uses `WebAssembly.instantiate()` — works in Chrome without `'wasm-unsafe-eval'`, but stricter environments may block. Must test explicitly |

---

## Integration Greenlight Summary

| Gate | Status | Ready? |
|---|---|---|
| Baseline stable | No regressions, 2 known bugs (C1, M1) | ✅ YES (after fixes) |
| UI consistent | All flows functional | ✅ YES |
| Settings system correct | Checkbox polarity bug | ⚠️ YES (after M1 fix) |
| Modal logic correct | Open/close/cancel all work | ✅ YES |
| Capture loop deterministic | Guards and timers correct | ✅ YES |
| OCR pipeline clean (Tesseract) | All modes functional | ✅ YES |
| Model files in place | No `.onnx` or `keys.txt` files | ❌ NO |
| ONNX runtime available | No script tag, no library | ❌ NO |
| `captureFrame()` paddle branch | Falls through to Tesseract | ❌ NO |
| PaddleOCR result mapping | No bbox → UI code | ❌ NO |
| Status indicators for paddle | Placeholder only | ❌ NO |
| Error handling for ONNX | No error paths | ❌ NO |
| CSP updated for ONNX | Missing origins/WASM policy | ❌ NO |
| No console errors | 1 leftover `console.log` | ⚠️ MINOR |
| No regressions | None found | ✅ YES |
| No layout issues | None found | ✅ YES |
| No missing selectors | None found | ✅ YES |

---

## Final Verdict

### The scaffold is solid. The implementation is not yet present.

The baseline codebase, UI, settings, modal, and capture loop are all stable and architecturally ready to accept a PaddleOCR branch. The integration point in `captureFrame()` is clean. The mode selection / modal / cancel flow works correctly.

**What must be built for PaddleOCR integration:**

1. ONNX Runtime Web `<script>` tag in `index.html`
2. Model files (`det.onnx`, `rec.onnx`, `keys.txt`) and `/models/paddle/` directory
3. `captureFrame()` branch: `if (mode === 'paddle') { ... }`
4. Real `loadPaddleOCR()` implementation replacing the placeholder
5. Result mapping: PaddleOCR bbox + text + confidence → `addOCRResultToUI()`
6. ONNX-specific error handling and status pill states
7. CSP `connect-src` update for model fetch origin
8. CSP `script-src` with `'wasm-unsafe-eval'` if needed
9. Service worker `ASSETS` update for new files

**Pre-integration fixes required (from Part 1):**

1. **C1:** Add `'./settings.js'` to service worker `ASSETS` array
2. **M1:** Change `warningCheckbox.checked = currentSettings.showHeavyWarning` to `warningCheckbox.checked = !currentSettings.showHeavyWarning` in `settings.js`
3. Remove unconditional `console.log` from `loadPaddleOCR()` in `app.js`

**Overall Merge Readiness Score: 7 / 10** — safe to merge the Tesseract-only baseline after C1 and M1 are fixed. PaddleOCR integration requires the 9 items listed above before it can ship.
