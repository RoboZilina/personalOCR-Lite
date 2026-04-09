# Transformers.js OCR Integration — Planning Document

---

## 1. Architecture Overview
- **Engine System Integration:**
  - `transformers.js` will be introduced as a third, fully isolated OCR engine alongside Tesseract and PaddleOCR.
  - The engine selector UI will add a new option (e.g., “Transformers.js OCR”) and update all engine-switching logic to support this new mode.
  - All transformers.js logic, state, and model management will be encapsulated in a dedicated module (e.g., `/js/transformers/transformers_ocr.js`), ensuring no cross-contamination with Tesseract or PaddleOCR.
  - The pipeline will accept `rawCropCanvas` (or a micro-filtered variant) as input, maintaining the unified canvas source of truth.
  - The transformers.js engine will expose a single async `recognize(canvas)` interface, matching the pattern of the other engines.
  - Debug thumbnail and UI update hooks will be integrated identically to existing engines.

## 2. Model Selection Strategy
- **Recommended Models for Japanese OCR:**
  - **Local:**  
    - TrOCR (Transformer-based OCR, with Japanese fine-tuning if available).
    - Donut (Document Understanding Transformer) with Japanese support.
    - Any ONNX-exported or WebGPU-compatible Japanese OCR model.
  - **Remote:**  
    - HuggingFace Inference API endpoints for TrOCR, Donut, or similar models with Japanese support.
- **Trade-offs:**
  - **ONNX/WebGPU (Local):**
    - Pros: Fully offline, no network dependency, lower latency after warm-up, privacy-preserving.
    - Cons: Large model sizes (tens to hundreds of MB), browser compatibility (WebGPU not universally available), higher memory usage, longer initial load.
  - **Remote Inference:**
    - Pros: Minimal client resource usage, always up-to-date models, no local storage constraints.
    - Cons: Requires network, subject to rate limits/latency, not available offline, potential privacy concerns.
- **Performance:**
  - Local ONNX/WebGPU: Fast inference after warm-up (sub-second to a few seconds per region, depending on model and hardware).
  - Remote: Latency depends on network and endpoint load (hundreds of ms to several seconds).

## 3. Pipeline Integration
- **Canvas Preparation:**
  - Input will be `rawCropCanvas` or a micro-filtered variant (e.g., after `trimEmptyVertical`, `padLeft`, `boostContrast`), depending on model requirements.
  - Preprocessing steps should be configurable per model; some models may require grayscale, resizing, or normalization.
- **Micro-filters:**
  - Reuse existing micro-filters if compatible with model input expectations.
  - Adapt or bypass filters if the model expects raw or differently preprocessed input.
- **Multi-line Text Handling:**
  - Ensure the pipeline can pass full text regions (not just single lines) to the model.
  - Post-processing may be required to reconstruct multi-line output, depending on model output format.
- **Vertical Japanese Text:**
  - Confirm model support for vertical text.
  - If not natively supported, consider pre-rotating canvas input or using a dedicated vertical-text model.

## 4. Async Flow & UI Integration
- **captureGeneration Integration:**
  - All transformers.js inference must be async and check `captureGeneration` before updating UI, mirroring Tesseract/PaddleOCR.
  - Results must be discarded if a newer capture is triggered before completion.
- **Debug Thumbnail:**
  - Update debug thumbnail with the exact canvas sent to the model, as with other engines.
- **Race Condition Avoidance:**
  - Use the same locking and generation counter mechanisms as existing engines.
  - Ensure all async operations are properly awaited and canceled if superseded.

## 5. Performance Considerations
- **WebGPU vs WASM vs ONNX:**
  - WebGPU offers the best performance but is not universally supported.
  - WASM/ONNX is more broadly compatible but may be slower.
  - Fallback logic may be needed to select the best available backend.
- **Model Size Constraints:**
  - Large models may impact initial load time and memory usage.
  - Consider quantized or distilled models for faster load and lower RAM footprint.
- **Memory Usage:**
  - Monitor and manage model and tensor memory to avoid browser crashes.
  - Dispose of models and tensors when switching engines or on low-memory signals.
- **Warm-up Strategies:**
  - Preload and warm up models on engine selection to reduce first-inference latency.
  - Optionally allow background warm-up after page load if resources permit.

## 6. Error Handling & Fallbacks
- **Offline Mode:**
  - Local models: Always available if loaded.
  - Remote models: Detect offline state and gracefully disable transformers.js engine, falling back to Tesseract/PaddleOCR.
- **Remote Inference Fallback:**
  - If remote inference fails (network, rate limit, server error), display a clear error and suggest switching engines.
- **Engine Switching Safety:**
  - Ensure all transformers.js state is disposed on engine switch.
  - Prevent UI or pipeline drift if a model fails to load or inference fails.

## 7. Deployment Considerations
- **CDN vs Local Model Hosting:**
  - Local: Store models in `/assets/models`, ensure they are included in deployment and service worker cache for offline use.
  - CDN: Use only if CORS is properly configured and models are cacheable.
- **CORS Issues:**
  - All remote model or inference endpoints must support CORS for browser access.
  - Local models avoid CORS entirely.
- **Browser Compatibility:**
  - WebGPU: Only available in recent Chrome/Edge/Firefox; fallback to WASM/ONNX if unavailable.
  - WASM: Broadly supported.
  - Test on all target browsers and devices.

## 8. Security Considerations
- **No Leaking of VN Content:**
  - For local models, all processing is client-side; no content leaves the browser.
  - For remote inference, ensure only the minimal required image data is sent, and inform users of network transmission.
- **No Remote Logging:**
  - Do not transmit logs, debug data, or user content to third-party endpoints.
- **No Unintended Data Transmission:**
  - Audit all network requests made by transformers.js and related code.
  - Disable or remove any telemetry or analytics in third-party code.

## 9. Final Recommendation
- **Best Option:**  
  - **Option A (Local Transformers.js Models)** is recommended for this project.
- **Rationale:**
  - Fully client-side operation aligns with privacy, offline support, and performance goals.
  - No dependency on external endpoints, no risk of rate limits or downtime.
  - User content (VN screenshots) never leaves the device, ensuring privacy.
  - Consistent with the current architecture (Tesseract and PaddleOCR are also local).
- **Trade-offs:**
  - Larger initial download and memory usage.
  - Requires careful model selection and possible quantization to fit browser constraints.
  - WebGPU support is not universal; fallback to WASM/ONNX is necessary.
- **Option B (Remote Inference):**
  - Only consider as a fallback for unsupported devices or as an advanced/optional feature.
  - Not suitable as the primary engine due to privacy, offline, and reliability concerns.

---

**End of planning document.**
