# VN-OCR — Hardened Milestone (v2.1.0)

A high-performance, browser-only Japanese OCR suite for Japanese Media. No installation, no backend, and uncompromising privacy.

## v2.1.0: The Hardened Baseline
This version represents a major architectural milestone focused on **Defensive State Management** and **Modular Engine Reliability**. The application is now architecturally immune to corrupted state glitches and "blank selector" bugs that often plague PWAs during updates.

## Features
- **ONNX Runtime Web Integration** — Native in-browser inference for advanced neural networks (PaddleOCR & MangaOCR) via a custom optimized VED pipeline.
- **Global Defensive Architecture** — Deterministic state restoration that guarantees a valid UI state regardless of `localStorage` conditions.
- **Modular Engine Registry** — Fully decoupled OCR backend (Tesseract, PaddleOCR, MangaOCR) allowing for seamless engine switching and unified readiness reporting.
- **Explicit Memory Disposal** — Real-time zeroing of pixel buffers and canvas scaling contexts to prevent memory leaks during high-resolution OCR operations.
- **PaddleOCR (v5) Engine** — High-precision neural-network recognizer. Includes vertical image slicing for 1–4 lines of text, optimized for dialogue boxes.
- **MangaOCR Engine** — Vision Transformer (ViT) model specifically tuned for Japanese Manga panels. 
    - > [!IMPORTANT]
    - > **Core Purity**: When using MangaOCR or PaddleOCR, the application automatically bypasses the image preprocessors to feed raw, high-fidelity pixels directly into the neural network's internal pipeline.
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
