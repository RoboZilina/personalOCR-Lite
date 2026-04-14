# VN-OCR: GOLD SNAPSHOT (v3.0nomangaOCR)

**Date:** 2026-04-14  
**Version:** `3.0nomangaOCR`  
**Identity:** PersonalOCR Lite (Production Baseline)

---

## 🏗️ Architectural Manifest

| Component | State | Implementation Detail |
| :--- | :---: | :--- |
| **Engine Core** | 💎 | Local-Only. PaddleOCR & Tesseract. Zero remote fetches. |
| **Asset Pathing** | 💎 | Strict `./models/` local subdirectory resolution. |
| **Isolation** | 💎 | COOP/COEP Headers enforced via Service Worker. |
| **Settings Engine** | 💎 | 100% Wired Persistence via `localStorage`. |
| **Initialization** | 💎 | Deterministic, Awaited, Signal-Hardened Bridge. |

---

## 🛠️ Hardening Log (v3.0 Release)

### 1. Signal & Logic Hardening
- **Deterministic Switch**: `switchEngineModular` is now a blocking async operation.
- **Relocated Observers**: UI listeners (`onReady`/`onLoading`) are bound only after `EngineManager` is valid.
- **Auto-Toggle Cascade Fix**: Added readiness guards to prevent recursive engine re-initialization from the side-menu.
- **Phantom Capture Fix**: Explicitly clearing `stabilityTimer` when automation is toggled OFF.
- **The Heartbeat Sync**: Manual and Auto-Capture cycles now end with a UI synchronization pulse.

### 2. Settings Engine Completion
- **Two-Pass Sync**: Logic added to `globalInitialize` to apply Theme immediately and Layout (History sidebar) finally, resolving the "History Desync on Reload" bug.
- **Upscale Wiring**: Tesseract `upscaleFactor` slider now persists correctly in `localStorage`.
- **Warning Persistence**: "Don't show again" checkbox for PaddleOCR is now fully wired to persistent settings.

### 3. Cleanliness & Dead Code
- **MangaOCR Purge**: 100% removal of MangaOCR engine logic and UI remnants.
- **Settings Sanitation**: Purged `showStatus` as dead code; standardized all `defaultSettings` keys.
- **Semantic variable mapping**: Performance diagnostics now use `var(--panel)` and `var(--text)` for perfect theme compatibility.

---

## 🔒 Security & Performance
- **COOP/COEP**: Mandatory for SharedArrayBuffer (WASM threads) and WebGPU.
- **Memory Safety**: `captureFrame` now zeros out canvases and clears 2D contents in the `finally` block of every cycle.
- **Throttling**: 300ms cooldown for manual re-capture; 800ms stability window for automation.

---

## 🏆 Project Status: GOLD BASELINE
The `GitHub-NoMangaOCR-dev` branch is stable, deterministic, and 100% ready for long-term archival and GitHub Pages hosting.
