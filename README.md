# VN-OCR — Hardened Baseline (v2.1.9)

A high-performance, browser-only Japanese OCR suite for Japanese Media. No installation, no backend, and uncompromising privacy.

## v2.1.9: The Hardware Acceleration & Hardening Milestone
This version represents the final production stabilization pass. The focus was on eliminating latency via **WebGPU Shader Pre-Warming**, reducing memory pressure through **Zero-Copy Buffer Pooling**, and providing transparent **Hardware Diagnostics** to the user.

## Features
- **WebGPU Acceleration (v2)** — Native GPU-accelerated inference for PaddleOCR and MangaOCR, featuring automated shader pre-warming to eliminate first-run compilation lag.
- **Zero-Allocation Memory Architecture** — Every inference loop (Paddle/Manga) now utilizes pre-allocated, hardware-aligned memory pools. This eliminates garbage collection churn and ensures smooth 60FPS UI performance during OCR.
- **Surgical Noise Filtering** — Real-time detection filtering (1600px area threshold) that prevents background artifacts from triggering redundant recognition passes.
- **Deterministic Capture Throttling** — Intelligent 300ms cooldown and engine-readiness guards prevent race conditions and redundant processing.
- **Global Defensive Architecture** — Deterministic state restoration that guarantees a valid UI state regardless of `localStorage` conditions.
- **Multi-Pass Analyst (v2)** — Hardened consensus voting for Tesseract. Runs 5 preprocessing passes and picks the most accurate read based on Japanese density.
- **Performance Diagnostics** — Visual 🔥/⚠️ indicators that signal whether the browser is running in High-Performance mode (SharedArrayBuffer + WebGPU active).
- **Explicit Memory Disposal** — Real-time zeroing of pixel buffers (`canvas.width = 0`) after every inference pass to prevent heap accumulation.
    > [!IMPORTANT]
    > **Core Purity**: When using MangaOCR or PaddleOCR, the application automatically bypasses the image preprocessors to feed raw, high-fidelity pixels directly into the neural network's internal pipeline.
- **Adjustable UI Sizes** — Customize Text Area and Font sizes (Standard/Small/Large) for ideal readability in the side menu.
- **8 image preprocessing modes** for Tesseract-based OCR (Adaptive, Multi-Pass, Last Resort, etc.).
- **Auto-capture** with pixel-level change detection and stabilization delay.
- **History log** with per-line copy/speak buttons, persisted across sessions.
- **Seamless Support** — One-click "Contact / Report Issue" link in the side menu.

## Hosting
Upload all project files to any static web host (GitHub Pages, Netlify, itch.io):
- `index.html`, `styles.css`, `app.js`
- `manifest.json`, `service-worker.js`
- `icon-192.png`, `icon-512.png`

**Deployment note:** Serve `service-worker.js` with `Cache-Control: no-cache` to ensure version updates (like this v2.1.0 release) propagate to all users instantly.

## Preprocessing Modes (Tesseract Engine Only)

| Mode | UI Label | Best For |
|---|---|---|
| Default Mini | `Default Mini` | Balanced speed/accuracy — the recommended baseline. |
| Default Full | `Default Full` | Maximum fidelity — best for classic or low-res VNs. |
| Adaptive | `Adaptive` | VN-optimized — handles gradients and semi-transparent text boxes. |
| Multi-Pass | `Multi-Pass` | Runs 5 combos and votes for best result — slower but very reliable. |
| Last Resort | `Last Resort` | 7-pass nuclear option with stroke reconstruction. |
| Raw | `Raw` | No preprocessing — direct capture for testing. |

## Tips
- **Neutral Engine Bypassing:** When using **PaddleOCR** or **MangaOCR**, changing the "Image Processing Mode" has no effect. These engines are pre-calibrated to work with the raw capture area.
- Start with **Default Mini** for Tesseract. It is optimized for modern web-based and high-resolution media.
- Use **Scaling 3×** or **4×** for very small or highly packed text.
- Use `?no-sw` in the URL to bypass the service worker if you suspect a cache-related issue.
