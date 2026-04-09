# Transformers.js OCR Integration — Enhanced Planning Document

This document outlines the deterministic, safe, and mutually exclusive integration of Transformers.js-based AI models into the VN-OCR pipeline.

---

## 1. Engine Architecture (The 4-Engine Model)

The application will transition to a single-source-of-truth dropdown containing 4 mutually exclusive engines:
1.  **Tesseract**: The classic, preprocessing-enabled engine.
2.  **PaddleOCR**: The high-precision neural recognizer.
3.  **MangaOCR (Transformers.js)**: Optimized for manga/visual novel text, supports vertical layout.
4.  **TrOCR-Small (Transformers.js)**: Fast, transformer-based "Printed" model.

**No Stacking:** Only one engine is active at a time. Switching to any AI engine (Paddle/Manga/TrOCR) automatically unloads the previous engine from memory.

---

## 2. Implementation: MangaOCR & TrOCR-Small

These two specific models will be implemented using the `transformers.js` library:

### **MangaOCR**
- **Model**: `Xenova/manga-ocr-base`
- **Use Case**: Best for vertical Japanese text and stylized fonts found in VNs.
- **Footprint**: ~30 MB ONNX.

### **TrOCR-Small**
- **Model**: `Xenova/trocr-small-printed`
- **Use Case**: Fast execution for clean, horizontal printed text.
- **Footprint**: ~20 MB ONNX.

---

## 3. Storage & Caching Strategy (IndexedDB)

Contrary to earlier plans, **Service Worker caching is NOT used** for model binaries.
- **Internal Caching**: Transformers.js uses its own internal logic to store models in the browser's **IndexedDB**.
- **Impact**: This avoids bloating the Service Worker's cache quota and prevents network timeouts during PWA installation.
- **Version Control**: Service Worker version will be bumped to `v1.3.2` to reflect the library integration, but it will not intercept model fetches.

---

## 4. UI & Preprocessing Behavior

### **Enforced Raw Input**
- When **MangaOCR** or **TrOCR-Small** is selected:
    - The `modeSelector` (Preprocessing Mode) is **disabled**.
    - The UI displays: *"Preprocessing disabled for AI OCR engines."*
- **Rationale**: Transformer-based models are trained on raw imagery. Forcing them through thresholding filters like "Default Full" or "Adaptive" can induce high error rates.

---

## 5. Lazy Loading & Resource Management

### **Zero-Impact Startup**
- AI models are **never** loaded on startup.
- Loading is triggered **only** when the user selects the engine in the dropdown.
- **Pattern**:
  ```javascript
  let mangaModel = null;
  async function ensureMangaLoaded() {
      if (!mangaModel) mangaModel = await pipeline("image-to-text", "Xenova/manga-ocr-base");
      return mangaModel;
  }
  ```

### **Memory Safety**
- Call `dispose()` or clear references when switching engines to prevent RAM bloat in long-running PWA sessions.

---

## 6. Pipeline Synchronization (Determinism)

- **Generation Guards**: Both engines must integrate with `captureGeneration`. If an inference pass for MangaOCR takes 2 seconds, but the user clicks "RE-CAPTURE" after 1 second, the old result **must** be discarded.
- **UI Locking**: `isProcessing` must be maintained correctly to prevent Auto-Capture "Double Fires."

---

## 7. Security & Privacy

- **100% Client-Side**: All inference is performed on the user's CPU/GPU via WASM/WebGPU. No VN imagery is ever transmitted to a server.
- **No Telemetry**: No third-party analytics or logging will be enabled in the Transformers.js configuration.

---

## 8. Summary of Changes

1.  **Update `index.html`**: Add MangaOCR and TrOCR-Small to `#model-selector`.
2.  **Modify `app.js`**: Update `switchEngine` to handle the two new cases.
3.  **Create `/js/transformers/`**: Encapsulate all pipeline logic here.
4.  **Bump SW to `v1.3.2`**.

**Status: READY FOR IMPLEMENTATION.**
