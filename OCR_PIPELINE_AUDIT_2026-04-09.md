# OCR Pipeline Deep Audit Results — 2026-04-09

---

## Summary

**NO ISSUES FOUND IN OCR PIPELINES.**

All engine logic is properly isolated. No accidental mutation, cross-contamination, or pixel corruption. All async and UI flows are robust against race conditions. All canvas and coordinate handling is correct.

---

## Detailed Findings

### 1. RAW CROP CANVAS CREATION & FIDELITY
- **Severity:** INFO
- **File:** app.js (captureFrame)
- **Details:** `rawCropCanvas` is always a new canvas per capture. Pixel extraction uses `drawImage(vnVideo, ...)` with bounds clamping. No accidental mutation or reuse between captures or engines. All downstream processing operates on new canvases.
- **Impact:** Ensures pixel fidelity and prevents cross-contamination between OCR engines.

### 2. PADDLEOCR MICRO-FILTER ISOLATION
- **Severity:** INFO
- **File:** app.js (trimEmptyVertical, padLeft, boostContrast)
- **Details:** PaddleOCR path applies micro-filters in sequence, each returning a new canvas. No mutation of the original `rawCropCanvas`. No shared state between Paddle and Tesseract branches.
- **Impact:** Micro-filters are isolated to PaddleOCR and do not affect Tesseract pipeline.

### 3. TESSERACT PREPROCESSING ISOLATION
- **Severity:** INFO
- **File:** app.js (applyPreprocessing)
- **Details:** Tesseract path uses `applyPreprocessing`, always returning a new canvas. No mutation of `rawCropCanvas`. All preprocessing steps are isolated to Tesseract.
- **Impact:** No cross-contamination between Tesseract and PaddleOCR.

### 4. DEBUG THUMBNAIL CORRECTNESS
- **Severity:** INFO
- **File:** app.js (updateDebugThumb)
- **Details:** `updateDebugThumb(canvas)` always receives the final preprocessed canvas for the active engine. No evidence of stale or incorrect thumbnails.
- **Impact:** Debug thumbnail accurately reflects the image sent to the OCR engine.

### 5. ENGINE SWITCHING & TEARDOWN
- **Severity:** INFO
- **File:** app.js (engineSelector change handler)
- **Details:** Switching to PaddleOCR disposes Tesseract worker. Switching to Tesseract disposes PaddleOCR sessions. No shared state or canvas between engines. `modeSelector.disabled` ensures preprocessing UI is only enabled for Tesseract.
- **Impact:** Prevents memory leaks and engine cross-contamination.

### 6. ASYNC FLOW & RACE CONDITION PROTECTION
- **Severity:** INFO
- **File:** app.js (captureGeneration)
- **Details:** `captureGeneration` counter is incremented on each capture. All async OCR results check `if (captureGeneration !== myGen) return;` before updating UI. Prevents stale/overlapping results from corrupting UI or state.
- **Impact:** Robust against rapid engine switching and overlapping captures.

### 7. CANVAS RESIZING & COORDINATE MAPPING
- **Severity:** INFO
- **File:** app.js, js/paddle/paddle_core.js
- **Details:** All resizing and cropping uses new canvases. No evidence of hidden scaling or coordinate drift. PaddleOCR's tensor conversion uses aspect-ratio preserving logic.
- **Impact:** Maintains pixel accuracy for both OCR engines.

### 8. SHARED CANVAS IN PADDLEOCR CORE
- **Severity:** MINOR
- **File:** js/paddle/paddle_core.js
- **Details:** PaddleOCR uses a module-level `sharedCanvas` for tensor conversion. Always returns a `.slice()` copy of the Float32Array if using a shared buffer. No evidence of cross-request data races, but future concurrency could introduce subtle bugs.
- **Impact:** Current usage is safe (single-threaded, sequential calls), but future concurrency could introduce subtle bugs.

### 9. ENGINE SELECTION & UI LOGIC
- **Severity:** INFO
- **File:** app.js (engineSelector)
- **Details:** Engine selection is always explicit via dropdown. No evidence of accidental engine switching or mode confusion.
- **Impact:** User intent is respected; no hidden engine toggling.

### 10. TIMING HAZARDS & CAPTURE LOCKS
- **Severity:** INFO
- **File:** app.js (isProcessing)
- **Details:** `isProcessing` flag prevents overlapping captures. Small cooldown after each capture to prevent rapid-fire triggers.
- **Impact:** Prevents UI/engine overload and ensures stable operation.

### 11. CANVAS REUSE & MUTATION
- **Severity:** INFO
- **File:** app.js, js/paddle/paddle_core.js
- **Details:** All image processing steps create new canvases. No evidence of accidental mutation or reuse of source canvases.
- **Impact:** Pixel integrity is preserved throughout the pipeline.

### 12. COORDINATE MAPPING
- **Severity:** INFO
- **File:** app.js (denormalizeSelection)
- **Details:** `denormalizeSelection` correctly maps selection overlay to video coordinates. All cropping uses clamped, floored values to prevent out-of-bounds errors.
- **Impact:** Accurate region extraction for OCR.

### 13. PADDLEOCR DETECTION/RECOGNITION PIPELINE
- **Severity:** INFO
- **File:** js/paddle/paddle_engine.js
- **Details:** Detection and recognition use separate ONNX sessions. All tensor and canvas operations are isolated per request. No evidence of shared state or buffer reuse across requests.
- **Impact:** Stable, isolated PaddleOCR pipeline.

### 14. NO EVIDENCE OF CROSS-CONTAMINATION
- **Severity:** INFO
- **File:** app.js
- **Details:** No shared objects, canvases, or buffers between Tesseract and PaddleOCR. All engine-specific logic is isolated.
- **Impact:** No risk of engine cross-contamination.

### 15. NO HIDDEN RESIZING OR SCALING
- **Severity:** INFO
- **File:** app.js, js/paddle/paddle_core.js
- **Details:** All resizing is explicit and documented. No hidden or implicit scaling.
- **Impact:** Predictable image processing.

### 16. NO ACCIDENTAL MUTATION OF rawCropCanvas
- **Severity:** INFO
- **File:** app.js
- **Details:** `rawCropCanvas` is never mutated after creation. All downstream steps operate on copies.
- **Impact:** Ensures source image integrity.

### 17. NO TIMING OR RACE CONDITION HAZARDS
- **Severity:** INFO
- **File:** app.js
- **Details:** All async flows are protected by `captureGeneration` and `isProcessing`.
- **Impact:** No observable timing hazards.

---

**End of audit.**
