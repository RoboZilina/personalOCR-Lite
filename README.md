# PersonalOCR Lite — Gold v3.1 Edition

**PersonalOCR Lite** is a high-performance, browser-only Japanese OCR suite optimized for **GitHub Pages** and static hosting environments. This version unites the surgical hardening of the **Gold v3.1** baseline with a streamlined, MangaOCR‑free architecture to ensure 100% compatibility with hosting size limitations.

---

## 🚀 Key Features & Gold Hardening
- **Native WebGPU Acceleration** — GPU-accelerated inference for PaddleOCR, enabled via locally hosted models.
- **Deterministic Engine Switching** — Hardened lifecycle management that guarantees the engine and UI remain perfectly synchronized even during rapid toggling.
- **100% Settings Persistence** — Every UI control, including Tesseract upscaling factors and history visibility, is now fully persistent across sessions.
- **High-Speed Clipping (Auto-Copy)** — A premium extraction utility that automatically copies manually selected text from transcription fields to the clipboard with visual feedback.
- **Reality-Sync Recovery** — Advanced DOM hydration logic that eliminates "temporal vacuum" race conditions during initial page load.
- **Zero-Allocation Memory Architecture** — Every inference loop uses pre-allocated, hardware-aligned memory pools, preventing Garbage Collection spikes.
- **Service Worker Performance (COOP/COEP)** — Custom header injection logic allows native WebGPU and Multi-threading access even on standard static hosts like GitHub Pages.

---

## 🧩 Engines & Models

### **✔ PaddleOCR (High‑Precision)**
- **Fully Local**: Loads `det.onnx` and `rec.onnx` strictly from the `/models/` folder.
- **WebGPU Inference**: Lag-free multi-line processing via native hardware access.
- **WASM Fallback**: Multi-threaded fallback for environments where WebGPU is unavailable.

### **✔ Tesseract (Standard OCR)**
- **Lightweight Logic**: Optimized for low-latency standard text blocks.
- **Hybrid Preprocessing**: Compatible with all advanced image processing modes (Adaptive, Multi-Pass, etc.).

### **✔ Purged Assets (Lite Edition)**
To ensure binary size compliance and deployment stability, the following have been permanently removed:
- MangaOCR engine and Transformers-based models.
- External CDN dependencies for model assets.
- Legacy nested model directory structures.

---

## 🔒 Privacy & Security

PersonalOCR Lite performs **all OCR locally** in your browser:
- No servers, no uploads, and zero telemetry.
- All model inference happens on your local hardware.
- The included Service Worker enforces `COOP` and `COEP` headers to unlock high-performance browser features safely.

---

## 🛠 Installation & Deployment

1. **Clone/Fork**: This repository is ready for GitHub Pages out of the box.
2. **Models**: Ensure `det.onnx`, `rec.onnx`, and `jpn.traineddata` are present in the `models/` directory.
3. **Activation**: Load the page, then **reload once**. The first load installs the Service Worker; the second load activates the high-performance header injection.

---

## 📊 Diagnostics (🔥)
Check the **Performance Icon** in the top right.
- **🔥 High-Performance**: WebGPU and Multi-threading are active.
- **⚠️ Compatibility Mode**: Running in restricted mode (usually due to browser sandboxing).

---

## 📘 License
MIT License. All OCR models belong to their respective authors.

---

## 📝 Project Context
This branch represents the unification of the **Gold v3.1** stability standards with the **Lite** portability requirements. It is the definitive build for users requiring a standalone, crash-proof OCR solution without the storage overhead of Transformers models.
