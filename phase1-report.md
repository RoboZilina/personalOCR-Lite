# PaddleOCR Integration — Phase 1 Walkthrough Report

**Date:** April 8, 2026
**Project:** VN-OCR Master Dashboard
**Scope:** Phase 1 — Preparation (scaffold + wiring, stub inference)
**Working Directory:** `vn-ocr-public-deployOpus2/vn-ocr-public-deployOpus/`

---

## Overview

Phase 1 establishes the full PaddleOCR integration surface — file structure, provider abstraction, UI wiring, service worker caching, and CSP — with **stub function bodies**. The goal is a safe, testable skeleton where the entire mode-switch → load → capture → teardown flow works end-to-end in the browser, but returns no real OCR output.

This report documents every change made, why it was made, and how to verify it.

---

## Architecture Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | ONNX Runtime Web (WASM only) | Universal browser support. WebGL/WebGPU deferred. |
| Model hosting | Self-hosted at `./models/paddle/` | Same-origin — no CSP issues, offline-capable via SW cache |
| Preprocessing | Minimal: `lr_upscale()` + `lr_addPadding()` only | PaddleOCR handles its own normalization. No binarize/threshold. |
| Code isolation | All PaddleOCR code in `./js/paddle/` | Never mixed into app.js. Clean module boundary. |
| Memory | Terminate-on-switch | Only one engine in memory at a time. Saves ~50-100MB RAM. |
| Provider pattern | Version-agnostic abstraction | PP-OCRv5 becomes a 1-file drop-in (`paddle_v5.js` + models). |

---

## Files Created

### 1. `models/paddle/manifest.json`

**Purpose:** Config-driven model metadata. Loaders read paths, tensor names, and shapes from this file instead of hardcoding them.

**Contents:**
- PP-OCRv3 entry with detection model (`japan_PP-OCRv3_det.onnx`), recognition model (`japanese_mobile_v2.0_rec.onnx`), and dictionary (`japan_dict.txt`)
- Tensor I/O names and shapes for both det and rec models
- Backend field (`"wasm"`) — PP-OCRv5 can switch to `"webgpu"` by updating this value

**Future use:** When PP-OCRv5 arrives, add a `"v5"` key with its own model paths and tensor metadata. No code changes needed.

---

### 2. `js/paddle/paddle_core.js`

**Purpose:** Provider interface layer + utility stubs. This is the only file `app.js` imports for PaddleOCR functionality.

**Exports (6 provider functions):**

| Function | Purpose | Stub Behavior |
|----------|---------|--------------|
| `setPaddleProvider(provider)` | Register a provider (v3, v5, etc.) | Sets module-level `PaddleProvider` variable |
| `getPaddleStatus()` | Query load state and version | Returns `{ loaded, version }` from provider |
| `loadPaddleModels(onStatus)` | Trigger model loading with status callback | Delegates to `PaddleProvider.loadModels()` |
| `runPaddleOCR(canvas)` | Full OCR pipeline | Returns `{ text: '[PaddleOCR stub — no model loaded]', confidence: 0 }` |
| `disposePaddle()` | Release ONNX sessions and memory | Calls `PaddleProvider.dispose()`, nulls reference |

**Exports (4 utility stubs — Phase 2 fills these in):**

| Function | Purpose | Stub Behavior |
|----------|---------|--------------|
| `fetchWithProgress(url, onProgress)` | Download with byte-level progress | Plain `fetch().arrayBuffer()` (no progress) |
| `canvasToFloat32Tensor(canvas)` | Canvas → Float32Array [1,3,H,W] | Returns empty Float32Array |
| `resizeCanvas(canvas, targetH, maxW)` | Aspect-ratio-preserving resize | Returns input canvas unchanged |
| `cropBoxFromCanvas(canvas, box)` | Extract sub-region | Returns input canvas unchanged |

**Key design rule:** `runPaddleOCR()` returns `{ text, confidence }` — identical shape to `runTesseract()`. This means `fuseOCRResults()` and `addOCRResultToUI()` work without modification.

---

### 3. `js/paddle/paddle_v3.js`

**Purpose:** PP-OCRv3 provider implementation (stubbed). Conforms to the provider interface defined by `paddle_core.js`.

**Provider object: `PaddleProviderV3`**

| Method | Purpose | Stub Behavior |
|--------|---------|--------------|
| `loadModels(onStatus)` | Load det/rec ONNX sessions + dictionary | Simulates 700ms loading with status messages: `🟡 Loading detection model...` → `🟡 Loading recognition model...` → `🟡 Loading dictionary...` → `🟢 PaddleOCR v3 Ready` |
| `detect(imageTensor, w, h)` | Run text detection | Returns single box covering full image |
| `recognize(crops)` | Run text recognition | Returns `[{ text: '[PaddleOCR stub]', confidence: 0 }]` |
| `dispose()` | Release ONNX sessions | Releases sessions, clears dictionary, sets `loaded = false` |

**Every stub has `// STUB:` and `// Real:` comments** documenting exactly what Phase 2 implementation replaces.

---

## Files Modified

### 4. `index.html` — CSP Update (line 13)

**Before:**
```
connect-src 'self' https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://tessdata.projectnaptha.com data:;
```

**After:**
```
script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval';
connect-src 'self' https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://tessdata.projectnaptha.com data:;
worker-src 'self' blob:;
```

**What changed:**
- `script-src` — allows ONNX Runtime WASM execution (`'wasm-unsafe-eval'`) and Tesseract CDN
- `worker-src` — allows ONNX Runtime blob workers
- `connect-src` — unchanged (models are same-origin, covered by `'self'`)

---

### 5. `index.html` — ONNX Runtime Script Tag (line 280)

**Inserted before the Tesseract script tag:**
```html
<script src="./js/ort.min.js"></script>
```

**Loading order is now:**
1. `ort.min.js` (ONNX Runtime — makes `ort` global available)
2. `tesseract.min.js` (Tesseract.js CDN with SRI)
3. `app.js` (ES module — imports from paddle_core.js)

**Note:** `ort.min.js` will 404 until the user downloads it in Phase 2. This is expected — stubs don't reference `ort`.

---

### 6. `app.js` — Paddle Imports (lines 1-19)

**Added after settings.js import:**
```js
import {
    setPaddleProvider,
    loadPaddleModels,
    runPaddleOCR,
    disposePaddle,
    getPaddleStatus
} from './js/paddle/paddle_core.js';

import { PaddleProviderV3 } from './js/paddle/paddle_v3.js';
```

**Why:** `app.js` needs to register the provider, trigger loading, run inference, and dispose — but all logic stays in the paddle modules.

---

### 7. `app.js` — `loadPaddleOCR()` Rewrite (line ~928)

**Before (placeholder):**
```js
function loadPaddleOCR() {
    setOCRStatus('ready', '🟢 PaddleOCR Placeholder');
}
```

**After (real wiring with error recovery):**
```js
async function loadPaddleOCR() {
    try {
        setPaddleProvider(PaddleProviderV3);
        await loadPaddleModels((msg) => setOCRStatus('loading', msg));
        const status = getPaddleStatus();
        setOCRStatus('ready', `🟢 PaddleOCR ${status.version} Ready`);
    } catch (err) {
        setOCRStatus('error', '🔴 PaddleOCR Load Failed');
        if (engineSelector) engineSelector.value = previousMode;
        setSetting('ocrMode', previousMode);
    }
}
```

**Flow:** Register provider → load models with status callback → show version-aware status. On failure: show error status + revert to previous mode.

---

### 8. `app.js` — `captureFrame()` Paddle Branch (line ~423)

**Before:** Try block immediately calls `ensureModelLoaded()` then routes to Tesseract modes.

**After:** Wraps existing Tesseract logic in `else` block. New `if (mode === 'paddle')` branch:

```js
if (mode === 'paddle') {
    const upscaled = lr_upscale(crop, parseFloat(upscaleSlider.value));
    const padded = lr_addPadding(upscaled, 10);
    updateDebugThumb(padded);
    setOCRStatus('processing', '🟡 Reading (PaddleOCR)...');
    const result = await runPaddleOCR(padded);
    if (captureGeneration !== myGen) return;
    if (result && result.text) addOCRResultToUI(result.text);
} else {
    // ... existing Tesseract logic unchanged ...
}
```

**Key design:** PaddleOCR uses only `lr_upscale()` + `lr_addPadding()`. No binarization, no adaptive threshold, no grayscale — PaddleOCR handles its own image normalization internally. The `captureGeneration` stale-callback check is preserved.

---

### 9. `app.js` — Engine Teardown in Mode-Switch Handler (line ~967)

**Added two teardown calls to the `engineSelector.change` listener:**

- **Entering paddle mode:** `if (ocrWorker) { ocrWorker.terminate(); ocrWorker = null; }` — kills Tesseract worker
- **Leaving paddle mode:** `disposePaddle();` — releases ONNX sessions

**Why:** Only one engine should be in memory at a time. Tesseract's `ensureModelLoaded()` lazily re-creates `ocrWorker` on next capture, so terminating it is safe.

---

### 10. `service-worker.js` — Full Update

**10a — Version bump:**
```
vn-ocr-cache-v1.1.0 → vn-ocr-cache-v1.2.0
```

**10b — ASSETS array expanded:**
```js
'./js/paddle/paddle_core.js',
'./js/paddle/paddle_v3.js'
```
These are precached on SW install. ONNX runtime and model files are NOT in ASSETS (too large).

**10c — Model cache constant:**
```js
const MODEL_CACHE_NAME = 'vn-ocr-models-v1';
```

**10d — Activate handler:** Now preserves `MODEL_CACHE_NAME` when cleaning old caches. Models survive app version bumps.

**10e — New fetch branch (cache-first):** Routes `/models/paddle/*` and `/js/ort*` requests to a dedicated long-lived cache. First fetch goes to network and caches the response. Subsequent requests serve from cache. This means 15-25MB of model files are downloaded once then served instantly.

**Three-tier caching strategy:**
| Request Type | Strategy | Cache |
|-------------|----------|-------|
| CDN (Tesseract) | Network-only | None (SRI handles integrity) |
| Models + ONNX | Cache-first | `vn-ocr-models-v1` (persistent) |
| Local assets | Stale-while-revalidate | `vn-ocr-cache-v1.2.0` (versioned) |

---

## Verification Checklist

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Page loads | No errors except 404 for `ort.min.js` (expected) |
| 2 | All 8 Tesseract modes | Work identically (regression check) |
| 3 | Select "PaddleOCR" → modal | Warning modal appears with Cancel/Continue |
| 4 | Click Continue | Status: `🟡 Loading detection model...` → `🟡 Loading recognition model...` → `🟡 Loading dictionary...` → `🟢 PaddleOCR v3 Ready` |
| 5 | Capture with PaddleOCR | Debug thumb shows upscaled+padded image. Latest text: `[PaddleOCR stub — no model loaded]` |
| 6 | Switch to Default (Mini) | PaddleOCR disposed. Next Tesseract capture works. |
| 7 | Cancel modal | Mode reverts to previous selection |
| 8 | DevTools → Service Workers | `vn-ocr-cache-v1.2.0` active |

---

## What Phase 2 Replaces

Phase 2 fills in the stub implementations with real ONNX inference. Only these functions change:

| File | Function | Stub → Real |
|------|----------|-------------|
| `paddle_core.js` | `fetchWithProgress()` | `ReadableStream` progress tracking |
| `paddle_core.js` | `canvasToFloat32Tensor()` | ImageData → Float32Array [1,3,H,W] normalized |
| `paddle_core.js` | `resizeCanvas()` | Aspect-ratio-preserving canvas resize |
| `paddle_core.js` | `cropBoxFromCanvas()` | Sub-region canvas crop |
| `paddle_core.js` | `runPaddleOCR()` | Full pipeline: tensor → detect → crop → recognize → join |
| `paddle_v3.js` | `loadModels()` | Fetch manifest, create ONNX sessions, load dictionary |
| `paddle_v3.js` | `detect()` | Run det model, threshold bitmap, find bounding boxes |
| `paddle_v3.js` | `recognize()` | Run rec model, CTC greedy decode with dictionary |

**Phase 2 prerequisites (manual downloads):**
- ONNX Runtime Web: `ort.min.js` + `ort-wasm.wasm` + `ort-wasm-simd.wasm` → `./js/`
- PaddleOCR models: `det.onnx` + `rec.onnx` + `dict.txt` → `./models/paddle/`

---

## File Inventory After Phase 1

```
vn-ocr-public-deployOpus2/vn-ocr-public-deployOpus/
├── app.js                          ← MODIFIED (imports, loadPaddleOCR, captureFrame, teardown)
├── index.html                      ← MODIFIED (CSP, ONNX script tag)
├── service-worker.js               ← MODIFIED (version, ASSETS, model cache)
├── settings.js                     (unchanged)
├── styles.css                      (unchanged)
├── manifest.json                   (unchanged)
├── js/
│   └── paddle/
│       ├── paddle_core.js          ← CREATED (provider interface + utility stubs)
│       └── paddle_v3.js            ← CREATED (PP-OCRv3 stub provider)
└── models/
    └── paddle/
        └── manifest.json           ← CREATED (model metadata)
```
