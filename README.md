# VN-OCR — Gold Baseline (v3.1-production)

A high-performance, browser-only Japanese OCR suite for Japanese Media. This branch is optimized for **Cloudflare Pages** deployment, combining the latest architectural hardening with edge-accelerated hardware access.

## v3.1: The "Gold" Hardening Milestone
This version represents the definitive production standard for the project. It backports critical reliability improvements from the core development baseline to the high-performance Cloudflare environment, ensuring 100% deterministic operation.

## Key Features & Hardening
- **Native WebGPU Acceleration** — GPU-accelerated inference for PaddleOCR and MangaOCR, enabled via native `_headers` configuration.
- **Deterministic Engine Switching** — Hardened lifecycle management that guarantees the engine and UI remain perfectly synchronized even during rapid toggling.
- **100% Settings Persistence** — Every UI control, including Tesseract upscaling and PaddleOCR warning states, is now fully persistent across sessions.
- **High-Speed Clipping (Auto-Copy)** — A premium extraction utility that automatically copies manually selected text from transcription fields to the clipboard with visual feedback.
- **Reality-Sync Recovery** — Advanced DOM hydration logic that eliminates "temporal vacuum" race conditions during initial page load.
- **Zero-Allocation Memory Architecture** — Every inference loop uses pre-allocated, hardware-aligned memory pools, preventing Garbage Collection spikes.
- **Service Worker Efficiency** — Optimized caching strategy specifically designed for Cloudflare, excluding massive binary models to prevent storage bloat.

## Hosting on Cloudflare Pages
This branch is "Cloudflare-Ready" out of the box:
1. **Headers**: Uses the root `_headers` file to set `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`.
2. **Assets**: Ensure `service-worker.js` is served with `Cache-Control: no-cache`.
3. **Optimized Delivery**: Performance is available immediately on page load without the need for the Service Worker "shim" required on other platforms.

## Diagnostics (🔥)
Check the **Fire icon (🔥)** in the top right to confirm your browser has successfully unlocked WebGPU and Multi-threading. If you see a **Warning (⚠️)**, the app is running in Compatibility Mode (CPU-only).

## Browser Compatibility
| Feature | Optimal (🔥) | Limited (⚠️) |
| :--- | :--- | :--- |
| **Engine** | Chromium 113+ (Chrome, Edge) | Firefox, Safari |
| **PWA / Cache** | Supported | Limited in Incognito |
| **WebGPU** | Native | Experimental / Disabled |
| **WASM Threading** | Active (via COOP/COEP) | Fallback to Single-Thread |

> [!IMPORTANT]
> Some browsers, mobile devices, or highly restricted enterprise environments may not support WebGPU or SharedArrayBuffer. In these cases, the application will fallback to **Compatibility Mode**, which is significantly slower. If the page fails to load, ensure you are not in a "Private/Incognito" tab which may block the Service Worker.

## Tips
- Use **Scaling 3×** or **4×** for low-resolution media or small font sizes.
- Use the **Auto-Capture** feature for hands-free extracted text flow during gameplay.
- **Clipping**: Highlighting text in the transcription area will automatically copy it to your clipboard if enabled.
