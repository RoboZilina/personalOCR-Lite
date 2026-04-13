# VN-OCR — Hardened Baseline (v2.1.12)

A high-performance, browser-only Japanese OCR suite for Japanese Media. No installation, no backend, and uncompromising privacy.

## v2.1.12: The WebGPU & Platform Compatibility Milestone
This version marks the official transition to **Hardware-Accelerated Neural Inference**. We have unlocked **WebGPU acceleration** for PaddleOCR and MangaOCR, implemented a **Cross-Origin Isolation** solution for GitHub Pages, and introduced a comprehensive **System Diagnostics Dashboard** to ensure users always know their performance state.

## Features
- **WebGPU Acceleration (v2)** — Native GPU-accelerated inference for PaddleOCR and MangaOCR. Features automated **Shader Pre-Warming** to eliminate first-run compilation lag and JIT-stutter.
- **System Diagnostics Dashboard** — A real-time 🔥/⚠️ diagnostic table that reports **Isolation State**, **WebGPU Support**, and **WASM Multi-threading** status. Accessible via the pulsing performance pill in the header.
- **GitHub Pages Isolation Hack** — Integrated Service Worker-based header injection (`COOP/COEP`) that enables SharedArrayBuffer and WebGPU on restricted static hosts like GitHub Pages.
- **Zero-Allocation Memory Architecture** — Every inference loop (Paddle/Manga) utilizes hardware-aligned, pre-allocated memory pools. This eliminates garbage collection churn and ensures smooth 60FPS UI performance during heavy OCR.
- **Surgical Noise Filtering** — Real-time detection filtering (1600px area threshold) that prevents background artifacts from triggering redundant recognition passes.
- **Multi-Pass Analyst (v2)** — Hardened consensus voting for Tesseract. Runs 5 preprocessing passes and picks the most accurate read based on Japanese language density.
- **Explicit Memory Disposal** — Real-time zeroing of pixel buffers (`canvas.width = 0`) after every inference pass to prevent heap accumulation.
- **Adjustable UI Sizes** — Customize Text Area and Font sizes (Standard/Small/Large) for ideal readability via the side menu.
- **8 image preprocessing modes** for Tesseract-based OCR (Adaptive, Multi-Pass, Last Resort, etc.).

## Hosting & Deployment

### Standard Deployment (Cloudflare, etc.)
Upload all project files to any host. Ensure `service-worker.js` is served with `Cache-Control: no-cache`.
> [!TIP]
> **Cloudflare Pages** is the recommended hosting platform as it supports native `_headers` for the fastest possible WebGPU activation.

### GitHub Pages Deployment
This repository is optimized for GitHub Pages via a Service Worker "Shim". 
- **Activation**: On the first visit, the app will register the Service Worker and then require **one manual reload** to unlock WebGPU and multithreading.
- The Diagnostic Dashboard will guide you through this process with a pulsing ⚠️ indicator if fallback mode is active.

## Tips
- **Pre-Warming**: The first time you switch to PaddleOCR or MangaOCR, the system will perform a silent "Warm-up" pass to compile shaders. This ensures zero-lag during actual capture.
- **Neutral Engine Bypassing**: When using **PaddleOCR** or **MangaOCR**, changing the "Image Processing Mode" has no effect. These engines use their own high-fidelity internal pipelines.
- **Scaling**: Use **Scaling 3×** or **4×** for very small text or low-resolution media.
- Use `?no-sw` in the URL to bypass the service worker for troubleshooting.

## Preprocessing Modes (Tesseract Engine Only)

| Mode | UI Label | Best For |
|---|---|---|
| Default Mini | `Default Mini` | Balanced speed/accuracy — the recommended baseline. |
| Default Full | `Default Full` | Maximum fidelity — best for classic or low-res VNs. |
| Adaptive | `Adaptive` | VN-optimized — handles gradients and semi-transparent text boxes. |
| Multi-Pass | `Multi-Pass` | Runs 5 combos and votes for best result — slower but very reliable. |
| Last Resort | `Last Resort` | 7-pass nuclear option with stroke reconstruction. |
| Raw | `Raw` | No preprocessing — direct capture for testing. |
