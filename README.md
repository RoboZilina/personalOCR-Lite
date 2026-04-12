# Personal OCR — Public Version ⚡

Free, browser-only Japanese OCR for Japanese Media. No install, no backend, works anywhere.

## Features
- **Transformers.js ONNX Integration** — Native in-browser inference for advanced neural networks.
- **PaddleOCR (v5) Engine** — High-precision neural-network recognizer (loads ~20-80MB). Includes vertical image slicing for 1–4 lines of horizontal text, optimized for dialogue boxes.
- **MangaOCR Engine** — Transformers ViT model highly optimized for reading Japanese Manga panels (loads ~450MB). Contextually adapts UI into side-by-side view and constraints for square selections.
- **Visual Slicing Guides** — Real-time canvas overlays to align text rows during PaddleOCR selection.
- **8 image preprocessing modes** with local mean adaptive thresholding, polarity detection, and halo removal.
- **3×3 median denoising** with sorting-network optimization.
- **Adjustable upscale slider** (1×–4× scaling before OCR).
- **4 Tesseract language models** (`jpn`, `jpn_best`, `jpn_fast`, `jpn_vert`)
- **Multi-Pass and Last Resort pipelines** that fuse results from multiple preprocessing combos
- **Auto-capture** with pixel-level change detection and stabilization delay
- **Text-to-Speech** (Japanese voices via Web Speech API)
- **History log** with per-line copy/speak buttons, persisted across sessions
- **Copy-on-select** — highlight text in output or history to auto-copy (toggle via menu)
- **Dark/Light themes** with system preference detection
- **PWA installable** — runs as a standalone app
- **Panic button** — one-click switch to Tesseract Multi-Pass mode

## Hosting
Upload all project files to any web host:
- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `service-worker.js`
- `icon-192.png`
- `icon-512.png`

Works on GitHub Pages, Netlify, itch.io, or any static hosting.

**Deployment note:** Serve `service-worker.js` with `Cache-Control: no-cache` to ensure updates propagate.

## Preprocessing Modes

| Mode | UI Label | Best For |
|---|---|---|
| Default Mini | `Default Mini` | Balanced speed/accuracy — good for clean, modern VNs |
| Default Full | `Default Full` | Maximum fidelity — best for classic or low-res VNs |
| Adaptive | `Adaptive` | VN-optimized — handles gradients and semi-transparent text boxes |
| Multi-Pass | `Multi-Pass` | Runs 5 combos and votes for best result — slower but reliable |
| Last Resort | `Last Resort` | 7-pass nuclear option with textbox isolation and stroke reconstruction |
| Contrast | `Contrast` | Hard binarization — best for flat, clean backgrounds |
| Grayscale | `Grayscale` | Preserved tonal detail — good for colorful or gradient backgrounds |
| Raw | `Raw` | No preprocessing — direct capture for testing |

## Tips
- **Neural Network Caching:** PaddleOCR and MangaOCR download large models on first use. Since they use your browser's persistent cache, they load instantly and function fully offline on future visits.
- Start with **Default Mini** — it handles most cases well for Tesseract.
- Use **Scaling 3×** or **4×** for very small text.
- Switch to `jpn_vert` for vertically written Tesseract boxes.
- If using **MangaOCR**, try using the **Contrast** preprocessing mode. MangaOCR was trained strictly on black-and-white page scans so providing a high-contrast image gives the best results.
- The debug thumbnail (next to RE-CAPTURE) shows the exact image sent to OCR.
- Use `?no-sw` in the URL to disable the service worker if updates get stuck.
