# PersonalOCR Lite

**PersonalOCR Lite** is a streamlined, privacy‑first OCR application designed for fully standalone operation on **GitHub Pages**.  
This Lite edition removes the heavy MangaOCR engine and relies exclusively on **PaddleOCR** and **Tesseract**, both of which are lightweight, fast, and compatible with browser‑based execution.

PersonalOCR Lite is optimized for:
- Local model hosting  
- WebGPU acceleration (when available)  
- SharedArrayBuffer + WASM threading  
- Zero‑backend, zero‑telemetry operation  
- Long‑term archival on static hosting platforms  

---

## 🚀 Features

### **✔ PaddleOCR (High‑Precision)**
- Local ONNX models  
- WebGPU‑accelerated inference  
- Multi‑threaded WASM execution  
- Ideal for general text, UI text, and mixed‑language content  

### **✔ Tesseract (Standard OCR)**
- Lightweight fallback engine  
- Works without GPU or isolation  
- Good for simple Latin‑script text  

### **✔ Fully Local Models**
All required models are loaded from `/models/`:
- `det.onnx`
- `rec.onnx`
- `cls.onnx`
- `dict.txt`

No external CDNs.  
No GitHub Releases fetches.  
No cross‑origin dependencies.

---

## 🔒 Privacy & Security

PersonalOCR Lite performs **all OCR locally** in your browser:

- No servers  
- No uploads  
- No analytics  
- No tracking  
- No external requests (after initial page load)

The included Service Worker applies:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

This enables:
- SharedArrayBuffer  
- WASM threads  
- WebGPU isolation  

---

## 🛠 Installation (GitHub Pages)

1. Clone or fork the repository  
2. Place your PaddleOCR models into: `/models/`
3. Enable GitHub Pages on the branch  
4. Load the page twice (first load installs the Service Worker)

---

## 📊 Diagnostics Dashboard

The built‑in diagnostics panel reports:

- Isolation State  
- WebGPU Support  
- WASM Threading  
- Active OCR Engine  

This helps users understand whether they are running in:
- **High‑Performance Mode** (isolated, GPU, threads)  
- **Compatibility Mode** (fallback execution)

---

## 🧩 Removed Components (Lite Edition)

The following components were removed to ensure GitHub Pages compatibility:

- MangaOCR engine  
- MangaOCR models  
- Manga‑specific UI and layout logic  
- External model URLs  
- Nested model directories  

---

## 📦 Project Structure

```
/index.html
/app.js
/styles.css
/service-worker.js
/models/
├── det.onnx
├── rec.onnx
├── cls.onnx
└── dict.txt
/js/
├── paddle/
└── tesseract/
```

---

## 📘 License
MIT License.  
All OCR models belong to their respective authors.

---

## 📝 Notes
This Lite edition is intended for **long‑term archival** and **static hosting**.  
For full‑scale OCR (including MangaOCR), use the main PersonalOCR build on a modern host.
