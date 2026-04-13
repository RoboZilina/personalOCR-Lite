# VN-OCR — Hardened Baseline (v2.5-production)

A high-performance, browser-only Japanese OCR suite for Japanese Media. This branch is optimized for **Cloudflare Pages** deployment.

## v2.5: The WebGPU Production Milestone
This version represents the high-performance production baseline. It features native **WebGPU acceleration** for PaddleOCR and MangaOCR, supported by Cloudflare's edge headers for seamless hardware access.

## Features
- **Native WebGPU Acceleration** — GPU-accelerated inference for PaddleOCR and MangaOCR, enabled via native `_headers` configuration.
- **Shader Pre-Warming** — Automated JIT compilation of shaders during engine load to eliminate first-run recognition stutter.
- **Zero-Allocation Memory Architecture** — Every inference loop uses pre-allocated, hardware-aligned memory pools. This ensures smooth 60FPS UI performance and prevents Garbage Collection spikes.
- **Deterministic State Restoration** — Hardened state logic that guarantees a stable UI regardless of `localStorage` state.
- **Surgical Noise Filtering** — Real-time detection filtering (1600px area threshold) to prevent background artifacts from triggering recognition.
- **Multi-Pass Analyst (v2)** — Hardened consensus voting for Tesseract. Runs 5 preprocessing passes and picks the most accurate read.
- **Subtle Performance Telemetry** — Minimalist 🔥/⚠️ indicator in the header to confirm that Cross-Origin Isolation and WebGPU are legally active.

## Hosting on Cloudflare Pages
This branch is "Cloudflare-Ready" out of the box. 
1. **Headers**: Uses the root `_headers` file to set `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`.
2. **Assets**: Ensure `service-worker.js` is served with `Cache-Control: no-cache`.
3. **No Shim Required**: Unlike the GitHub Pages version, this deployment does **not** require a Service Worker hack or auto-reloads. Performance is available immediately on page load.

## Tips
- **Check the 🔥**: If you see the Fire icon in the top right, your browser has successfully unlocked WebGPU and Multi-threading.
- **Engine Bypassing**: When using **PaddleOCR** or **MangaOCR**, image processing modes are bypassed to ensure the neural networks receive high-fidelity raw pixels.
- Use **Scaling 3×** or **4×** for low-resolution or small-font media.
