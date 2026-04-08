# VN-OCR — Phase 2 Handoff Report

> **Purpose:** Complete state snapshot + Phase 2 implementation plan for a future AI model session.
> **Date:** 2026-04-08
> **Working directory:** `vn-ocr-public/vn-ocr-public-deployOpus2/vn-ocr-public-deployOpus/`
> **Backup of this state:** `vn-ocr-public/vn-ocr-backup-phase1-fixed/`

---

## 1. Project Overview

VN-OCR is a Progressive Web App for real-time Japanese visual novel OCR. It captures a region of a screen-shared window, preprocesses the image, runs OCR, and displays results with clipboard integration, TTS, and history.

**Current engines:**
- **Tesseract.js v5** — 8 preprocessing modes (raw, binarize, adaptive, grayscale, default_mini, default_full, multi, last_resort)
- **PaddleOCR (stub)** — Phase 1 scaffold in place, returns placeholder text

---

## 2. Architecture Decisions (Locked — Do Not Change)

| Decision | Value | Rationale |
|---|---|---|
| Runtime | ONNX Runtime Web | Universal model runner, runs PaddleOCR ONNX exports |
| Backend | WASM only | `'wasm-unsafe-eval'` in CSP; no WebGL needed for text |
| Hosting | Self-hosted (`./js/`, `./models/paddle/`) | PWA offline requirement |
| Preprocessing | `lr_upscale()` + `lr_addPadding(10)` only | PaddleOCR has its own internal preprocessing |
| Isolation | All PaddleOCR code in `./js/paddle/` | Never mix into app.js |
| Memory | Terminate-on-switch | Only one engine in memory at a time; saves ~50-100MB |
| Provider pattern | Version-agnostic | PP-OCRv5 would be a 1-file swap (new `paddle_v5.js` + models + manifest entry) |

---

## 3. Current File Inventory

### 3.1 New Files (Created in Phase 1)

#### `models/paddle/manifest.json`
Config-driven model metadata. Phase 2 code reads this to get file paths and tensor names.
```json
{
  "v3": {
    "det": "japan_PP-OCRv3_det.onnx",
    "rec": "japanese_mobile_v2.0_rec.onnx",
    "dict": "japan_dict.txt",
    "backend": "wasm",
    "detInput": { "name": "x", "shape": [1, 3, -1, -1] },
    "detOutput": { "name": "sigmoid_0.tmp_0" },
    "recInput": { "name": "x", "shape": [1, 3, 48, -1] },
    "recOutput": { "name": "softmax_0.tmp_0" },
    "normalize": {
      "mean": [0.485, 0.456, 0.406],
      "std": [0.229, 0.224, 0.225]
    }
  }
}
```
> **Note:** The `normalize` field contains ImageNet mean/std constants required by PaddleOCR models. `canvasToFloat32Tensor()` must apply: `(pixel/255 - mean[c]) / std[c]` per channel. Without this, inference will produce garbage output. Phase 2 must also update the actual `models/paddle/manifest.json` file to include this field.

#### `js/paddle/paddle_core.js`
Provider interface layer — the **only** file app.js imports for PaddleOCR.

**Exports (interfaces — working):**
- `setPaddleProvider(provider)` — registers a version provider
- `getPaddleStatus()` → `{ loaded, version }`
- `loadPaddleModels(onStatus)` — delegates to provider's `loadModels()`
- `runPaddleOCR(canvas)` → `{ text, confidence }` — **STUB: returns placeholder**
- `disposePaddle()` — releases provider and nulls reference

**Utility stubs (Phase 2 fills these):**
- `fetchWithProgress(url, onProgress)` → ArrayBuffer — currently just `fetch(url)`
- `canvasToFloat32Tensor(canvas)` → Float32Array — currently returns empty array
- `resizeCanvas(canvas, targetH, maxW)` → canvas — currently returns input unchanged
- `cropBoxFromCanvas(canvas, box)` → canvas — currently returns input unchanged

#### `js/paddle/paddle_v3.js`
PP-OCRv3 stub provider. Simulates model loading with `setTimeout()` delays.

**Provider interface:**
- `version: 'v3'`
- `loaded: false` (set to `true` after simulated load)
- `detSession: null`, `recSession: null`, `dictionary: []`
- `loadModels(onStatus)` — shows sequential status messages with 300ms/300ms/100ms delays
- `detect(imageTensor, width, height)` — returns `[{ x:0, y:0, w:width, h:height }]` (full image as one box)

> **Phase 2 signature change:** `detect()` should be refactored to `detect(canvas)` — accepting a canvas instead of a raw Float32Array. Resizing a CHW Float32Array to be divisible-by-32 is non-trivial; it's far simpler for `detect()` to receive the canvas, call `resizeCanvas()` internally, then convert to tensor. See Step 14 for details.
- `recognize(crops)` — returns `[{ text: '[PaddleOCR stub]', confidence: 0 }]`
- `dispose()` — releases sessions, clears dictionary, sets loaded=false

### 3.2 Modified Files

#### `index.html`
Two changes from original:

**1. CSP meta tag (line 13-14):**
```html
<meta http-equiv="Content-Security-Policy"
    content="script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval' 'unsafe-inline'; connect-src 'self' https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://tessdata.projectnaptha.com data:; worker-src 'self' blob:;">
```
- `'wasm-unsafe-eval'` — required for ONNX WASM compilation
- `'unsafe-inline'` — added for Live Server dev compatibility; **Phase 2 should replace with hash/nonce for production**
- `worker-src 'self' blob:` — for ONNX Runtime blob workers

**2. Script tags (lines 280-285):**
```html
<!-- Phase 2: uncomment when ort.min.js is downloaded -->
<!-- <script src="./js/ort.min.js"></script> -->
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    integrity="sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F"
    crossorigin="anonymous"></script>
<script type="module" src="app.js"></script>
```
- `ort.min.js` is **commented out** — uncomment in Phase 2 after downloading the file
- Script load order must remain: ort.min.js → tesseract.min.js → app.js

#### `app.js`

**Change 1 — Imports (lines 1-19):**
```js
import { loadSettings, getSetting, setSetting, applySettingsToUI, applyUIToSettings } from './settings.js';

import { setPaddleProvider, loadPaddleModels, runPaddleOCR, disposePaddle, getPaddleStatus } from './js/paddle/paddle_core.js';

import { PaddleProviderV3 } from './js/paddle/paddle_v3.js';
```

**Change 2 — `captureFrame()` paddle branch (line ~425):**
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
    // ... existing Tesseract branches unchanged ...
}
```
- Uses only `lr_upscale()` + `lr_addPadding(10)` — no binarize/threshold
- `runPaddleOCR()` returns `{ text, confidence }` matching `runTesseract()` shape
- `captureGeneration` stale check preserved

**Change 3 — `loadPaddleOCR()` rewrite (line ~938):**
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
- Error recovery: reverts dropdown + setting to `previousMode`

**Change 4 — Engine teardown in mode-switch handler (line ~969-981):**
```js
engineSelector?.addEventListener('change', () => {
    const newMode = engineSelector.value;
    if (newMode === 'paddle') {
        if (ocrWorker) { ocrWorker.terminate(); ocrWorker = null; }  // ← teardown Tesseract
        // ... modal logic ...
    } else {
        disposePaddle();  // ← teardown PaddleOCR
        setSetting('ocrMode', newMode);
        applyUIToSettings();
    }
    previousMode = newMode;
});
```
- Entering paddle: kills Tesseract worker (re-created lazily by `ensureModelLoaded()`)
- Leaving paddle: calls `disposePaddle()` to release ONNX sessions

#### `service-worker.js`
Full rewrite. Version `v1.2.0`.

**Key structure:**
```js
const CACHE_NAME = 'vn-ocr-cache-v1.2.0';
const ASSETS = [
    './', './index.html', './styles.css', './app.js', './settings.js',
    './manifest.json', './js/paddle/paddle_core.js', './js/paddle/paddle_v3.js'
];
const MODEL_CACHE_NAME = 'vn-ocr-models-v1';
```

**3-tier fetch strategy:**
1. **CDN** (`url.origin !== location.origin`) → network-only (no cache; avoids SRI conflicts)
2. **Models/ONNX** (`/models/paddle/` or `/js/ort`) → cache-first into `MODEL_CACHE_NAME` (persistent, survives version bumps)
3. **Local assets** → stale-while-revalidate with `CACHE_NAME` (versioned, cleared on upgrade)

**Activate handler** preserves `MODEL_CACHE_NAME` across version bumps — models don't re-download.

### 3.3 Unchanged Files
- `styles.css` — no changes
- `settings.js` — no changes
- `manifest.json` — no changes
- `README.md` — no changes

---

## 4. Current Behavior (What Works Now)

| Action | Result |
|---|---|
| Page load on any non-paddle mode | Tesseract loads normally, all 8 modes work |
| Select "PaddleOCR" in dropdown | Warning modal appears (if not suppressed) |
| Click "Continue" on modal | Status pill: `🟡 Loading detection model...` → `🟡 Loading recognition model...` → `🟡 Loading dictionary...` → `🟢 PaddleOCR v3 Ready` (700ms total) |
| Capture with PaddleOCR active | Debug thumb shows upscaled image, `[PaddleOCR stub — no model loaded]` appears in results |
| Switch back to Tesseract mode | `disposePaddle()` called, Tesseract modes work normally |
| Cancel modal | Dropdown reverts to previous mode |
| "Don't show again" checkbox | Suppresses modal on future selections |
| Service worker | v1.2.0, paddle JS files precached, model cache strategy ready |

---

## 5. Phase 2 Implementation Plan

### 5.0 Prerequisites (Manual Downloads)

Before any code changes, these files must be obtained:

**ONNX Runtime Web (place in `./js/`):**
- `ort.min.js` — main runtime
- `ort-wasm.wasm` — baseline WASM backend
- `ort-wasm-simd.wasm` — SIMD-optimized backend (auto-detected)
- `ort-wasm-simd-threaded.wasm` — threaded SIMD variant (optional — see threading note below)

Source: `npm pack onnxruntime-web` or from [jsDelivr](https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/)

> **WASM Path Resolution (CRITICAL):** ONNX Runtime looks for `.wasm` files relative to the page root by default, NOT relative to `ort.min.js`. You **must** configure the WASM path before creating any session:
> ```js
> ort.env.wasm.wasmPaths = './js/';
> ```
> Without this, the runtime will 404 looking for `.wasm` files at `/ort-wasm.wasm` instead of `/js/ort-wasm.wasm`.
>
> **Threading:** By default, ONNX Runtime may attempt to use `SharedArrayBuffer` and threaded WASM. If you don't include the threaded `.wasm` files, either:
> - Include `ort-wasm-simd-threaded.wasm` in `./js/`, OR
> - Disable threading: `ort.env.wasm.numThreads = 1;`
>
> Note: `SharedArrayBuffer` requires COOP/COEP headers which most static hosts don't set. Setting `numThreads = 1` is the safer default for PWAs.

**PaddleOCR PP-OCRv3 Models (place in `./models/paddle/`):**
- `japan_PP-OCRv3_det.onnx` — text detection model (~2-4MB)
- `japanese_mobile_v2.0_rec.onnx` — text recognition model (~5-8MB)
- `japan_dict.txt` — character dictionary for CTC decode

Source: PaddlePaddle model zoo or HuggingFace (must be ONNX-exported versions)

### 5.1 Step 11 — Uncomment `ort.min.js` script tag

**File:** `index.html` (line 281)
**Action:** Uncomment the script tag:
```html
<!-- BEFORE -->
<!-- <script src="./js/ort.min.js"></script> -->

<!-- AFTER -->
<script src="./js/ort.min.js"></script>
```
**Verify:** `typeof ort === 'object'` in browser console.

### 5.2 Step 12 — Configure WASM paths and verify tensor names

> **This step MUST happen before writing any inference code.** If the tensor names in manifest.json are wrong, you'll waste time debugging runtime errors in Steps 13-14.

**Action 12a — Configure ONNX Runtime WASM paths.**
Add this to the top of `paddle_v3.js` `loadModels()`, before any `ort.InferenceSession.create()` call:
```js
ort.env.wasm.wasmPaths = './js/';
ort.env.wasm.numThreads = 1;  // safe default for PWAs without COOP/COEP headers
```

**Action 12b — Verify tensor names in browser console.**
```js
ort.env.wasm.wasmPaths = './js/';
ort.env.wasm.numThreads = 1;
const det = await ort.InferenceSession.create('./models/paddle/japan_PP-OCRv3_det.onnx', { executionProviders: ['wasm'] });
console.log('Det inputs:', det.inputNames, 'outputs:', det.outputNames);
const rec = await ort.InferenceSession.create('./models/paddle/japanese_mobile_v2.0_rec.onnx', { executionProviders: ['wasm'] });
console.log('Rec inputs:', rec.inputNames, 'outputs:', rec.outputNames);
```
**If names differ from manifest.json** → update `models/paddle/manifest.json` entries to match actual model I/O names before proceeding.

**Checkpoint:** Both sessions create successfully. Tensor names in manifest.json match actual model.

### 5.3 Step 13 — Fill in `paddle_core.js` utilities

**File:** `js/paddle/paddle_core.js`
Replace the 4 utility stubs and the `runPaddleOCR` stub with real implementations.

#### `fetchWithProgress(url, onProgress)` → ArrayBuffer
```
1. response = await fetch(url)
2. total = parseInt(response.headers.get('Content-Length') || '0')
3. if (total === 0 || !response.body) {
4.     // Fallback: no Content-Length (common with Live Server / local files)
5.     onProgress(-1)   // signal indeterminate progress
6.     return await response.arrayBuffer()
7. }
8. reader = response.body.getReader()
9. Read chunks in loop, accumulate in Uint8Array
10. Call onProgress(Math.round(loaded / total * 100)) per chunk
11. Return final ArrayBuffer
```
> **Guard:** `Content-Length` may be absent or zero on local dev servers. The `-1` signal lets the caller show "Loading..." instead of a percentage.

#### `canvasToFloat32Tensor(canvas, normalize)` → Float32Array
```
1. ctx = canvas.getContext('2d')
2. imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
3. pixels = imageData.data (RGBA)
4. Create Float32Array of size 3 * H * W
5. Fill in CHW order: all R values, then all G values, then all B values
6. For each pixel value:
7.     val = pixel / 255.0
8.     if (normalize) val = (val - normalize.mean[channel]) / normalize.std[channel]
9. Return Float32Array
```
> **CRITICAL:** PaddleOCR models require ImageNet normalization: `mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`. Without this, inference produces garbage. The `normalize` parameter comes from `manifest.json` → `config.normalize`. Pass it from the provider when calling this utility.

#### `resizeCanvas(canvas, targetH, maxW)` → canvas
```
1. aspectRatio = canvas.width / canvas.height
2. newH = targetH
3. newW = Math.min(Math.round(targetH * aspectRatio), maxW)
4. Create new canvas newW × newH
5. ctx.drawImage(source, 0, 0, newW, newH)
6. Return new canvas
```

#### `cropBoxFromCanvas(canvas, box)` → canvas
```
1. Create new canvas box.w × box.h
2. ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h)
3. Return new canvas
```

#### `runPaddleOCR(canvas)` → `{ text, confidence }` (replace stub)
```
1. try {
2.     boxes = await PaddleProvider.detect(canvas)
3.     if (boxes.length === 0) return { text: '', confidence: 0 }
4.     crops = boxes.map(box => cropBoxFromCanvas(canvas, box))
5.     results = await PaddleProvider.recognize(crops)
6.     text = results.map(r => r.text).join('')
7.     confidence = average of results[].confidence
8.     return { text, confidence }
9. } catch (err) {
10.    console.error('PaddleOCR pipeline error:', err)
11.    return { text: '', confidence: 0 }
12. }
```
> **Changed from original plan:** `detect()` now receives the canvas directly (not a pre-converted tensor) so it can handle its own resize-to-div-by-32 → tensor conversion internally. `canvasToFloat32Tensor()` is called inside `detect()` and `recognize()`, not here. Error handling added to prevent uncaught throws from bubbling up with no diagnostic info.

### 5.4 Step 14 — Fill in `paddle_v3.js` real inference

**File:** `js/paddle/paddle_v3.js`
Replace the 3 stub methods with real ONNX inference.

#### `loadModels(onStatus)` — replace setTimeout stubs
```
1. ort.env.wasm.wasmPaths = './js/'
2. ort.env.wasm.numThreads = 1
3. Fetch and parse ./models/paddle/manifest.json
4. Read config = manifest.v3; store as this.config
5. Fetch det model with progress → create ort.InferenceSession
6. Fetch rec model with progress → create ort.InferenceSession
7. Fetch dict file → split into array, prepend 'blank' at index 0
8. this.loaded = true
```
**Key details:**
- `ort.InferenceSession.create(buffer, { executionProviders: [config.backend], graphOptimizationLevel: 'all' })`
- `config.backend` is `"wasm"` from manifest.json
- `ort` is a global from the script tag, not imported
- **WASM paths MUST be set before first session creation** (see Step 12a)

#### `detect(canvas)` — replace full-image-box stub
> **Signature changed from `detect(imageTensor, width, height)` to `detect(canvas)`.** The function now handles its own resize → tensor conversion internally, avoiding the complexity of resizing a raw CHW Float32Array.

```
1. width = canvas.width, height = canvas.height
2. Compute resizedH, resizedW (both divisible by 32, preserve aspect ratio, max 960)
3. resizedCanvas = resizeCanvas(canvas, resizedH, resizedW)
4. tensorData = canvasToFloat32Tensor(resizedCanvas, this.config.normalize)
5. inputTensor = new ort.Tensor('float32', tensorData, [1, 3, resizedH, resizedW])
6. Run detSession with input name from config.detInput.name ("x")
7. Get output from config.detOutput.name ("sigmoid_0.tmp_0")
8. Threshold bitmap: pixel > 0.3 → 1, else → 0
9. Find connected components (flood fill or contour tracing)
10. Compute bounding boxes, scale back to original dimensions
11. Filter boxes where w < 5 or h < 5
12. Sort top-to-bottom, left-to-right
13. Return array of { x, y, w, h }
```

#### `recognize(crops)` — replace stub text
```
For each crop canvas:
1. Resize to h=48, proportional width (max 320) using resizeCanvas()
2. Convert to Float32 tensor using canvasToFloat32Tensor(resized, this.config.normalize)
3. Create ort.Tensor('float32', tensor, [1, 3, 48, resized.width])
4. Run recSession with input name from config.recInput.name ("x")
5. Get output from config.recOutput.name ("softmax_0.tmp_0")
6. CTC greedy decode:
   - numTimesteps = output.length / dictionary.length
   - For each timestep: find argmax character index
   - Skip index 0 (blank) and consecutive duplicates
   - Map indices to dictionary characters
   - Track confidence as average of max probabilities
7. Push { text, confidence }
Return all results
```

### 5.5 Step 15 — Production CSP hardening (optional)

Replace `'unsafe-inline'` in CSP with either:
- A specific hash: `'sha256-<hash>'` for Live Server's reload script
- Or remove it entirely if not using Live Server in production

---

## 6. Phase 2 Verification Checklist

After all Phase 2 steps are complete:

1. [ ] `typeof ort === 'object'` in console — confirms ONNX Runtime loaded
2. [ ] Select PaddleOCR → Continue → real model loading with progress percentages
3. [ ] Status shows: `🟡 Det model 45%` → `🟡 Rec model 72%` → `🟢 PaddleOCR v3 Ready`
4. [ ] Capture VN text box → debug thumb shows upscaled image → real Japanese text in output
5. [ ] Auto-capture with PaddleOCR active works correctly
6. [ ] Switch to any Tesseract mode → ONNX sessions released → Tesseract works normally
7. [ ] Offline test: disable network after first model load → PaddleOCR still works (cached)
8. [ ] DevTools → Cache Storage → `vn-ocr-models-v1` contains .onnx and .wasm files
9. [ ] All 8 Tesseract modes unaffected (regression test)
10. [ ] No console errors except browser extension noise

---

## 7. File Structure After Phase 2

```
vn-ocr-public-deployOpus/
├── index.html              (CSP + uncommented ort.min.js script tag)
├── app.js                  (imports + paddle branch — NO changes in Phase 2)
├── styles.css              (unchanged)
├── settings.js             (unchanged)
├── manifest.json           (PWA manifest — unchanged)
├── service-worker.js       (v1.2.0 — NO changes in Phase 2)
├── js/
│   ├── ort.min.js          ← Phase 2 download
│   ├── ort-wasm.wasm       ← Phase 2 download
│   ├── ort-wasm-simd.wasm  ← Phase 2 download
│   └── paddle/
│       ├── paddle_core.js  ← Phase 2 fills utility stubs + runPaddleOCR pipeline
│       └── paddle_v3.js    ← Phase 2 fills loadModels/detect/recognize with ONNX inference
└── models/
    └── paddle/
        ├── manifest.json   (already exists — may need tensor name updates after Step 12b)
        ├── japan_PP-OCRv3_det.onnx       ← Phase 2 download
        ├── japanese_mobile_v2.0_rec.onnx ← Phase 2 download
        └── japan_dict.txt                ← Phase 2 download
```

---

## 8. Key Code Relationships

```
app.js
  ├── imports from js/paddle/paddle_core.js (5 functions)
  ├── imports from js/paddle/paddle_v3.js (PaddleProviderV3 object)
  ├── loadPaddleOCR() calls: setPaddleProvider() → loadPaddleModels() → getPaddleStatus()
  ├── captureFrame() 'paddle' branch calls: runPaddleOCR(canvas)
  └── engineSelector change handler calls: disposePaddle() / ocrWorker.terminate()

js/paddle/paddle_core.js
  ├── holds PaddleProvider reference (set by setPaddleProvider)
  ├── runPaddleOCR() orchestrates: Provider.detect(canvas) → cropBoxFromCanvas → Provider.recognize(crops)
  ├── exports canvasToFloat32Tensor(canvas, normalize) — used by paddle_v3.js detect() and recognize()
  └── exports resizeCanvas, cropBoxFromCanvas, fetchWithProgress — used by paddle_v3.js

js/paddle/paddle_v3.js
  ├── imports utilities from paddle_core.js (canvasToFloat32Tensor, resizeCanvas, fetchWithProgress)
  ├── uses global `ort` (from script tag, NOT imported)
  ├── reads models/paddle/manifest.json for file paths, tensor names, and normalization constants
  ├── detect(canvas) does: resizeCanvas → canvasToFloat32Tensor(canvas, config.normalize) → ort.InferenceSession.run
  ├── recognize(crops) does: resizeCanvas → canvasToFloat32Tensor(crop, config.normalize) → ort.InferenceSession.run → CTC decode
  └── sets ort.env.wasm.wasmPaths = './js/' and ort.env.wasm.numThreads = 1 before session creation

models/paddle/manifest.json
  └── config-driven: file names, tensor I/O names, shapes, backend, normalize { mean, std }
```

---

## 9. Important Notes for Future AI Model

1. **Do NOT modify `app.js`** in Phase 2 — all changes are in `paddle_core.js` and `paddle_v3.js` only (plus uncommenting one line in `index.html` and adding normalization to `manifest.json`)
2. **`ort` is a global**, not an ES module import — it comes from the `<script src="./js/ort.min.js">` tag
3. **Set `ort.env.wasm.wasmPaths = './js/'` BEFORE any `ort.InferenceSession.create()`** — without this, ONNX Runtime will 404 looking for `.wasm` files at the page root
4. **Set `ort.env.wasm.numThreads = 1`** — `SharedArrayBuffer` requires COOP/COEP headers that most static hosts don't set. Threading will silently fail or crash without these headers
5. **Verify tensor names (Step 12b) BEFORE writing inference code** — the names in manifest.json are provisional and may not match the actual model files. Debugging wrong tensor names after implementing inference wastes significant time
6. **ImageNet normalization is REQUIRED** — PaddleOCR expects `(pixel/255 - mean) / std` with `mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`. Without this, all inference output will be garbage. The `normalize` field in manifest.json provides these constants
7. **`detect()` accepts a canvas, not a tensor** — the Phase 1 stub signature was `detect(imageTensor, width, height)` but Phase 2 changes this to `detect(canvas)` to avoid the complexity of resizing raw CHW Float32Arrays
8. **Tensor names in manifest.json are provisional** — Step 12b verifies against actual model files before any inference code is written
9. **The model file names are approximate** — the user needs to find the correct ONNX-exported PaddleOCR v3 Japanese models, which may have slightly different filenames. Update manifest.json to match
10. **Every stub has `// STUB:` and `// Real:` comments** marking exactly what to replace
11. **`runPaddleOCR()` must always return `{ text, confidence }`** — this shape is consumed by `addOCRResultToUI()` and `fuseOCRResults()` in app.js
12. **Service worker version** should be bumped to `v1.3.0` if any cached assets change in Phase 2
13. **The `'unsafe-inline'` in CSP** was added for Live Server compatibility — remove for production or replace with a hash/nonce
