import { 
    loadSettings, 
    getSetting, 
    setSetting, 
    applySettingsToUI, 
    applyUIToSettings 
} from './settings.js';

import { 
    runPaddleOCR
} from './js/paddle/paddle_core.js';

import { PaddleOCR } from './js/paddle/paddle_engine.js';

// DOM Elements
const selectWindowBtn = document.getElementById('select-window-btn');
const vnVideo = document.getElementById('vn-video');
const selectionOverlay = document.getElementById('selection-overlay');
const historyContent = document.getElementById('history-content');
const ttsVoiceSelect = document.getElementById('tts-voice-select');
const speakLatestBtn = document.getElementById('speak-latest-btn');
const latestText = document.getElementById('latest-text');
const ocrStatus = document.getElementById('ocr-status');
const refreshOcrBtn = document.getElementById('refresh-ocr-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const engineSelector = document.getElementById('model-selector');
const panicBtn = document.getElementById('panic-btn');
const modeSelector = document.getElementById('mode-selector');
const autoToggle = document.getElementById('auto-capture-toggle');
const upscaleSlider = document.getElementById('upscale-slider');
const upscaleVal = document.getElementById('upscale-val');

// Phase 2: Lazy-load state initialization
modeSelector.disabled = (engineSelector.value !== 'tesseract');

// Phase 5: PWA Install Management (Fixed duplication)
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

document.getElementById('install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
});




// State
let voices = [];
let currentUtterance = null;
let videoStream = null;
let ocrWorker = null;
let isOcrReady = false;
let isProcessing = false;
let captureGeneration = 0;
let selectionRect = null;
let currentModelAlias = null;

// Smart Scout: 32x32 Comparison Logic
const scoutCanvas = document.createElement('canvas');
scoutCanvas.width = 32; scoutCanvas.height = 32;
const scoutCtx = scoutCanvas.getContext('2d', { willReadFrequently: true });
let lastScoutData = null;
let autoCaptureTimer = null;
let stabilityTimer = null;

// ==========================================
// 0. Initialization & UI Sync
// ==========================================

function loadVoices() {
    voices = window.speechSynthesis.getVoices();
    const jaVoices = voices.filter(v => v.lang.startsWith('ja'));
    if (ttsVoiceSelect) {
        ttsVoiceSelect.innerHTML = '<option value="">🔇 TTS Off</option>';
        jaVoices.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = voice.name;
            if (voice.name.includes('Haruka') || voice.name.includes('Google 日本語')) option.selected = true;
            ttsVoiceSelect.appendChild(option);
        });
    }
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

if (upscaleSlider) {
    upscaleSlider.oninput = () => upscaleVal.textContent = parseFloat(upscaleSlider.value).toFixed(1);
}

function setOCRStatus(state, text) {
    if (!ocrStatus) return;
    ocrStatus.className = `status-pill ${state}`;
    ocrStatus.textContent = text;
}

async function ensureModelLoaded(requestedAlias) {
    if (ocrWorker && currentModelAlias === requestedAlias) return;
    setOCRStatus('loading', `🟡 Loading ${requestedAlias}...`);
    isOcrReady = false;
    if (ocrWorker) { await ocrWorker.terminate(); ocrWorker = null; }
    try {
        let langPath = 'https://tessdata.projectnaptha.com/4.0.0/';
        let useGzip = true;
        let actualLang = 'jpn';
        if (requestedAlias === 'jpn_best') {
            langPath = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_best@main/';
            useGzip = false;
        } else if (requestedAlias === 'jpn_fast') {
            langPath = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main/';
            useGzip = false;
        } else if (requestedAlias === 'jpn_vert') actualLang = 'jpn_vert';

        ocrWorker = await Tesseract.createWorker(actualLang, 1, {
            langPath: langPath,
            gzip: useGzip,
            logger: m => {
                if (m.status === 'loading language traineddata') {
                    const pct = Math.round(m.progress * 100);
                    setOCRStatus('loading', `🟡 Data ${pct}%`);
                }
            }
        });
        currentModelAlias = requestedAlias;
        isOcrReady = true;
        // Tesseract-specific: optimize for VN text blocks
        await ocrWorker.setParameters({ 
            tessedit_pageseg_mode: '6'
        });
        setOCRStatus('ready', '🟢 OCR Ready');
    } catch (e) {
        setOCRStatus('error', '🔴 Load Error');
        if (requestedAlias !== 'jpn' && !ensureModelLoaded._fallback) {
            ensureModelLoaded._fallback = true;
            try { await ensureModelLoaded('jpn'); }
            finally { ensureModelLoaded._fallback = false; }
        }
    }
}

async function initOCR() {
    // Since #model-selector now handles engines, we default Tesseract to 'jpn_best'
    await ensureModelLoaded('jpn_best');
}


if (modeSelector) {
    modeSelector.addEventListener('change', () => {
        applyUIToSettings();
    });
}


if (panicBtn) {
    panicBtn.onclick = () => {
        engineSelector.value = 'tesseract';
        engineSelector.dispatchEvent(new Event('change'));
        modeSelector.value = 'multi';
        modeSelector.disabled = false;
        panicBtn.classList.add('active');
        setTimeout(() => panicBtn.classList.remove('active'), 1000);
        if (selectionRect) captureFrame(selectionRect);
    };
}

// ==========================================
// 1. Audio & TTS
// ==========================================

function speak(text) {
    if (!ttsVoiceSelect || !ttsVoiceSelect.value || !text) return;
    if (currentUtterance) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = voices.find(v => v.name === ttsVoiceSelect.value);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = 'ja-JP';
    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

if (speakLatestBtn) speakLatestBtn.onclick = () => { if (latestText) speak(latestText.textContent); };

if (historyContent) {
    historyContent.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const item = btn.closest('.history-item');
        const textSpan = item ? item.querySelector('span') : null;
        if (!textSpan) return;
        const action = btn.getAttribute('data-action');
        if (action === 'speak') speak(textSpan.textContent);
        if (action === 'copy') {
            navigator.clipboard.writeText(textSpan.textContent);
            btn.innerHTML = '✅';
            setTimeout(() => btn.innerHTML = '📋', 1000);
        }
    });
    historyContent.addEventListener('mouseup', () => {
        if (!getSetting('autoCopy')) return;
        const sel = window.getSelection().toString().trim();
        if (!sel) return;
        navigator.clipboard.writeText(sel).then(() => {
            historyContent.style.outline = '2px solid var(--accent)';
            setTimeout(() => { historyContent.style.outline = ''; }, 300);
        }).catch(() => {});
    });
}

if (latestText) {
    latestText.addEventListener('mouseup', () => {
        if (!getSetting('autoCopy')) return;
        const sel = window.getSelection().toString().trim();
        if (!sel) return;
        navigator.clipboard.writeText(sel).then(() => {
            latestText.style.outline = '2px solid var(--accent)';
            setTimeout(() => { latestText.style.outline = ''; }, 300);
        }).catch(() => {});
    });
}

// ==========================================
// 2. Window Capture
// ==========================================

async function startCapture() {
    try {
        videoStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" }, audio: false });
        vnVideo.srcObject = videoStream;
        videoStream.getVideoTracks()[0].onended = stopCapture;
        selectWindowBtn.classList.add('stop');
        selectWindowBtn.textContent = 'Stop Capture';
        document.getElementById('placeholder').style.display = 'none';
        const hint = document.getElementById('selection-hint');
        if (hint) hint.classList.add('visible');
    } catch (err) {
        if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    }
}

function stopCapture() {
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
    videoStream = null; vnVideo.srcObject = null;
    if (autoCaptureTimer) { clearInterval(autoCaptureTimer); autoCaptureTimer = null; }
    if (stabilityTimer) { clearTimeout(stabilityTimer); stabilityTimer = null; }
    document.getElementById('placeholder').style.display = 'flex';
    const hint = document.getElementById('selection-hint');
    if (hint) hint.classList.remove('visible');
    selectWindowBtn.classList.remove('stop');
    selectWindowBtn.textContent = 'Select Window Source';
}

if (selectWindowBtn) selectWindowBtn.onclick = () => videoStream ? stopCapture() : startCapture();

// ==========================================
// 3. Selection Overlay Logic
// ==========================================

if (selectionOverlay) {
    const ctx = selectionOverlay.getContext('2d');
    let isSelecting = false, startX = 0, startY = 0, currentX = 0, currentY = 0;
    const resizeCanvas = () => {
        selectionOverlay.width = selectionOverlay.clientWidth;
        selectionOverlay.height = selectionOverlay.clientHeight;
        if (selectionRect) drawSelectionRect();
    };
    new ResizeObserver(resizeCanvas).observe(selectionOverlay);
    const getMousePos = (e) => {
        const rect = selectionOverlay.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    selectionOverlay.onmousedown = e => {
        if (e.button !== 0) return;
        isSelecting = true; const pos = getMousePos(e);
        startX = currentX = pos.x; startY = currentY = pos.y;
        selectionRect = null; drawSelectionRect();
        const hint = document.getElementById('selection-hint');
        if (hint) hint.classList.remove('visible');
    };
    window.addEventListener('mousemove', e => { if (isSelecting) { const pos = getMousePos(e); currentX = pos.x; currentY = pos.y; drawSelectionRect(); } });
    window.addEventListener('mouseup', e => {
        if (!isSelecting) return;
        isSelecting = false; const pos = getMousePos(e);
        currentX = pos.x; currentY = pos.y;
        const w = selectionOverlay.width, h = selectionOverlay.height;
        const finalRect = {
            x: Math.min(startX, currentX) / w,
            y: Math.min(startY, currentY) / h,
            width: Math.abs(currentX - startX) / w,
            height: Math.abs(currentY - startY) / h
        };
        const hint = document.getElementById('selection-hint');
        if (finalRect.width > 0.005) {
            selectionRect = finalRect;
            refreshOcrBtn.disabled = false;
            captureFrame(selectionRect);
            if (hint) hint.classList.remove('visible');
        } else {
            selectionRect = null;
            if (hint) hint.classList.add('visible');
        }
        drawSelectionRect();
    });
    function drawSelectionRect() {
        const canvasW = selectionOverlay.width, canvasH = selectionOverlay.height;
        ctx.clearRect(0, 0, canvasW, canvasH);
        if (!isSelecting && !selectionRect) return;
        const x = isSelecting ? Math.min(startX, currentX) : selectionRect.x * canvasW;
        const y = isSelecting ? Math.min(startY, currentY) : selectionRect.y * canvasH;
        const w = isSelecting ? Math.abs(currentX - startX) : selectionRect.width * canvasW;
        const h = isSelecting ? Math.abs(currentY - startY) : selectionRect.height * canvasH;
        if (isSelecting) { ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; ctx.fillRect(x, y, w, h); }
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#10b981'; const s = 10;
        ctx.fillRect(x, y, s, 3); ctx.fillRect(x, y, 3, s);
        ctx.fillRect(x + w - s, y, s, 3); ctx.fillRect(x + w - 3, y, 3, s);
        ctx.fillRect(x, y + h - 3, s, 3); ctx.fillRect(x, y + h - s, 3, s);
        ctx.fillRect(x + w - s, y + h - 3, s, 3); ctx.fillRect(x + w - 3, y + h - s, 3, s);
    }
}

// ==========================================
// 4. Auto-Capture
// ==========================================

function checkAutoCapture() {
    if (!autoToggle || !autoToggle.checked || !videoStream || !selectionRect) return;

    // 1. Maintain scout data even during processing to prevent "stale" comparison after long loads.
    // IMPORTANT: Auto-capture must keep lastScoutData fresh even while isProcessing is true,
    // otherwise it will "wake up blind" after long operations (like PaddleOCR load)
    // and fire phantom double OCR triggers.
    const sel = denormalizeSelection(selectionRect, vnVideo, selectionOverlay);
    scoutCtx.drawImage(vnVideo, sel.x, sel.y, sel.w, sel.h, 0, 0, 32, 32);
    const pix = scoutCtx.getImageData(0, 0, 32, 32).data;
    const currentData = new Uint32Array(pix.buffer);

    // 2. Only run comparison and stability triggers if we aren't already busy
    if (!isProcessing && lastScoutData) {
        let diffPixels = 0;
        for (let i = 0; i < currentData.length; i++) { if (currentData[i] !== lastScoutData[i]) diffPixels++; }
        if (diffPixels > 10) {
            clearTimeout(stabilityTimer);
            autoToggle.parentElement.classList.add('active');
            stabilityTimer = setTimeout(() => { 
                autoToggle.parentElement.classList.remove('active'); 
                captureFrame(selectionRect); 
            }, 800);
        }
    }
    lastScoutData = new Uint32Array(currentData);
}

if (autoToggle) {
    autoToggle.onchange = () => {
        const label = autoToggle.nextElementSibling;
        setSetting('autoCapture', autoToggle.checked);
        if (autoToggle.checked) {
            if (label) label.textContent = "auto re-capture ON";
            if (autoCaptureTimer) clearInterval(autoCaptureTimer);
            autoCaptureTimer = setInterval(checkAutoCapture, 500);
        } else {
            if (label) label.textContent = "auto re-capture OFF";
            clearInterval(autoCaptureTimer);
            autoToggle.parentElement.classList.remove('active');
        }
    };
}

// ==========================================
// 5. OCR Processing Core
// ==========================================

/** BT.601 luma from RGB components. */
const lumaBT601 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Denormalize a normalized selection rect to video pixel coordinates. */
function denormalizeSelection(rect, videoEl, overlayEl) {
    const vWidth = videoEl.videoWidth, vHeight = videoEl.videoHeight;
    const cWidth = overlayEl.width, cHeight = overlayEl.height;
    const vAspect = vWidth / vHeight, cAspect = cWidth / cHeight;
    let actualWidth, actualHeight, offsetX = 0, offsetY = 0;
    if (vAspect > cAspect) { actualWidth = cWidth; actualHeight = cWidth / vAspect; offsetY = (cHeight - actualHeight) / 2; }
    else { actualHeight = cHeight; actualWidth = cHeight * vAspect; offsetX = (cWidth - actualWidth) / 2; }
    const rectX = rect.x * cWidth, rectY = rect.y * cHeight;
    const rectW = rect.width * cWidth, rectH = rect.height * cHeight;
    const x = ((rectX - offsetX) / actualWidth) * vWidth;
    const y = ((rectY - offsetY) / actualHeight) * vHeight;
    const w = (rectW / actualWidth) * vWidth;
    const h = (rectH / actualHeight) * vHeight;
    if (getSetting('debug')) console.debug('[VN-OCR] selection:', { x, y, w, h, vWidth, vHeight });
    return { x, y, w, h };
}

/** Update the debug thumbnail from a preprocessed canvas. */
function updateDebugThumb(canvas) {
    const debugThumb = document.getElementById('debug-crop-img');
    if (!debugThumb || !canvas) return;
    if (canvas.height < 120) {
        debugThumb.src = canvas.toDataURL();
    } else {
        debugThumb.src = scaleCanvasToThumb(canvas, 700, 300).toDataURL();
    }
    debugThumb.style.display = 'block';
}

// Helper: scale canvas down to fit bounding box (never upscales)
function scaleCanvasToThumb(c, maxW, maxH) {
    const r = document.createElement('canvas');
    const ratio = Math.min(maxW / c.width, maxH / c.height, 1);
    r.width = c.width * ratio;
    r.height = c.height * ratio;
    r.getContext('2d').drawImage(c, 0, 0, r.width, r.height);
    return r;
}

// === UNIVERSAL MICRO-FILTER HELPERS ===

function trimEmptyVertical(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;

    let top = 0;
    let bottom = height - 1;

    for (; top < height; top++) {
        let empty = true;
        for (let x = 0; x < width; x++) {
            if (data[(top * width + x) * 4 + 3] !== 0) { empty = false; break; }
        }
        if (!empty) break;
    }

    for (; bottom > top; bottom--) {
        let empty = true;
        for (let x = 0; x < width; x++) {
            if (data[(bottom * width + x) * 4 + 3] !== 0) { empty = false; break; }
        }
        if (!empty) break;
    }

    const newH = bottom - top + 1;
    if (newH <= 0) return canvas;

    const out = document.createElement("canvas");
    out.width = width;
    out.height = newH;
    out.getContext("2d").drawImage(canvas, 0, top, width, newH, 0, 0, width, newH);
    return out;
}

function padLeft(canvas, px = 4) {
    const out = document.createElement("canvas");
    out.width = canvas.width + px;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(canvas, px, 0);
    return out;
}

function boostContrast(canvas, factor = 1.08) {
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        d[i]   = Math.min(255, d[i]   * factor);
        d[i+1] = Math.min(255, d[i+1] * factor);
        d[i+2] = Math.min(255, d[i+2] * factor);
    }

    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    out.getContext("2d").putImageData(img, 0, 0);
    return out;
}

async function captureFrame(rect) {
    if (!vnVideo || !vnVideo.videoWidth || !rect || isProcessing) return;
    isProcessing = true;
    if (getSetting('debug')) console.log("Capture triggered");
    const myGen = ++captureGeneration;

    const vWidth = vnVideo.videoWidth, vHeight = vnVideo.videoHeight;
    const sel = denormalizeSelection(rect, vnVideo, selectionOverlay);
    const cx_ = Math.max(0, Math.floor(sel.x)), cy_ = Math.max(0, Math.floor(sel.y));
    const cw_ = Math.max(1, Math.min(vWidth - cx_, Math.floor(sel.w))), ch_ = Math.max(1, Math.min(vHeight - cy_, Math.floor(sel.h)));

    const rawCropCanvas = document.createElement('canvas');
    rawCropCanvas.width = cw_; rawCropCanvas.height = ch_;
    rawCropCanvas.getContext('2d').drawImage(vnVideo, cx_, cy_, cw_, ch_, 0, 0, cw_, ch_);

    // 6. Logging for verification
    if (getSetting('debug')) console.log(`[VN-OCR] Crop Source: sx=${cx_}, sy=${cy_}, sw=${cw_}, sh=${ch_}`);

    const engine = engineSelector.value;
    const mode = modeSelector.value;

    try {
        if (engine === 'paddle') {
            if (!window.paddleProvider) {
                setOCRStatus('error', 'PaddleOCR not ready');
                return;
            }
            // === FIXED TEXTBOX CROP (DETECTORLESS PIPELINE) ===
            let clean = trimEmptyVertical(rawCropCanvas);
            clean = padLeft(clean, 4);
            clean = boostContrast(clean, 1.08);

            updateDebugThumb(clean);

            const text = await window.paddleProvider.recognize(clean);
            if (captureGeneration !== myGen) return;

            // Update UI with the result
            if (text && text.trim()) {
                addOCRResultToUI(text);
                setOCRStatus('ready', '🟢 OCR Complete');
            } else {
                setOCRStatus('ready', '⚪ No text detected');
            }
        } else {
            // Tesseract always uses jpn_best now per Section 1 Cleanup
            await ensureModelLoaded('jpn_best');

            if (mode === 'last_resort') {
                const result = await runLastResortOCR(rawCropCanvas, myGen);
                if (captureGeneration !== myGen) return;
                updateDebugThumb(result.canvas);
                addOCRResultToUI(result.text);
            } else if (mode === 'multi') {
                const result = await runMultiPassOCR(rawCropCanvas, myGen);
                if (captureGeneration !== myGen) return;
                updateDebugThumb(result.canvas);
                addOCRResultToUI(result.text);
            } else {
                const processed = applyPreprocessing(rawCropCanvas, mode);
                if (captureGeneration !== myGen) return;
                updateDebugThumb(processed);
                setOCRStatus('processing', '🟡 Reading...');
                const result = await runTesseract(processed);
                if (captureGeneration !== myGen) return;
                addOCRResultToUI(result.text);
            }
        }
    } catch (err) { 
        console.error("OCR Error:", err);
        setOCRStatus('error', '🔴 OCR Error'); 
    }
    finally { 
        // Small cooldown to prevent rapid-fire re-triggering
        setTimeout(() => {
            isProcessing = false; 
            if (isOcrReady) setOCRStatus('ready', '🟢 OCR Ready'); 
        }, 100);
    }
}

/** Integral-image local mean adaptive threshold. Returns thresholded ImageData. */
function adaptiveThreshold(canvas, ctx, res, { windowDivisor, thresholdFactor, preInvert, preDenoise }) {
    if (preInvert) canvas = invertCanvas(canvas);
    canvas = sharpenCanvas(canvas);
    if (preDenoise) canvas = medianFilter(canvas);

    const octx = res.getContext('2d');
    octx.drawImage(canvas, 0, 0);
    const id2 = octx.getImageData(0, 0, res.width, res.height);
    const d2 = id2.data;
    const w = res.width, h = res.height;
    const integral = new Float64Array(w * h);
    const lumaArr = new Float64Array(w * h);

    for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = lumaBT601(d2[i], d2[i + 1], d2[i + 2]);
            lumaArr[y * w + x] = v;
            rowSum += v;
            integral[y * w + x] = (y === 0 ? 0 : integral[(y - 1) * w + x]) + rowSum;
        }
    }

    const s = Math.floor(w / windowDivisor);
    const s2 = Math.floor(s / 2);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - s2), x2 = Math.min(w - 1, x + s2);
            const y1 = Math.max(0, y - s2), y2 = Math.min(h - 1, y + s2);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            let sum = integral[y2 * w + x2];
            if (x1 > 0) sum -= integral[y2 * w + x1 - 1];
            if (y1 > 0) sum -= integral[(y1 - 1) * w + x2];
            if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * w + x1 - 1];

            const i = (y * w + x) * 4;
            d2[i] = d2[i + 1] = d2[i + 2] =
                (lumaArr[y * w + x] * count < sum * thresholdFactor) ? 0 : 255;
        }
    }

    ctx.putImageData(id2, 0, 0);
    return id2;
}

function applyPreprocessing(canvas, mode) {
    if (mode === 'raw') return lr_addPadding(canvas, 10);
    const scale = Math.max(1, Math.min(4, parseFloat(upscaleSlider?.value ?? '2')));
    canvas = lr_upscale(canvas, scale);

    const res = document.createElement('canvas'); res.width = canvas.width; res.height = canvas.height;
    const ctx = res.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    const id = ctx.getImageData(0, 0, res.width, res.height); const d = id.data;
    let workingId = null;
    if (mode === 'raw') {
        return lr_addPadding(canvas, 10);
    } else if (mode === 'binarize') {
        canvas = invertCanvas(canvas);
        canvas = sharpenCanvas(canvas);

        ctx.drawImage(canvas, 0, 0);
        const id2 = ctx.getImageData(0, 0, res.width, res.height);
        const d2 = id2.data;

        for (let i = 0; i < d2.length; i += 4) {
            const v = lumaBT601(d2[i], d2[i + 1], d2[i + 2]);
            const contrasted = 128 + (v - 128) * 1.35;
            const out = contrasted < 128 ? 0 : 255;
            d2[i] = d2[i + 1] = d2[i + 2] = out;
        }

        ctx.putImageData(id2, 0, 0);
        canvas = medianFilter(res);
        workingId = id2;
    } else if (mode === 'adaptive') {
        workingId = adaptiveThreshold(canvas, ctx, res, { windowDivisor: 8, thresholdFactor: 0.85, preInvert: true, preDenoise: false });
        canvas = medianFilter(res);
    } else if (mode === 'grayscale') {
        canvas = sharpenCanvas(canvas);

        ctx.drawImage(canvas, 0, 0);
        const id2 = ctx.getImageData(0, 0, res.width, res.height);
        const d2 = id2.data;

        for (let i = 0; i < d2.length; i += 4) {
            const v = lumaBT601(d2[i], d2[i + 1], d2[i + 2]);
            const contrasted = 128 + (v - 128) * 1.15;
            const out = contrasted < 0 ? 0 : (contrasted > 255 ? 255 : contrasted);
            d2[i] = d2[i + 1] = d2[i + 2] = out;
        }

        ctx.putImageData(id2, 0, 0);
        canvas = medianFilter(res);
        workingId = id2;
    } else if (mode === 'default_mini') {
        workingId = adaptiveThreshold(canvas, ctx, res, { windowDivisor: 10, thresholdFactor: 0.90, preInvert: false, preDenoise: true });
    } else if (mode === 'default_full') {
        workingId = adaptiveThreshold(canvas, ctx, res, { windowDivisor: 8, thresholdFactor: 0.80, preInvert: true, preDenoise: true });
    }

    // === UNIFIED CLEANUP STEP ===
    if (workingId) {
        const w = res.width, h = res.height;
        const d2 = workingId.data;
        let brightRegions = 0, darkRegions = 0;
        const marginW = Math.floor(w * 0.05), marginH = Math.floor(h * 0.05);
        const sampleW = Math.floor((w - 2 * marginW) / 3), sampleH = Math.floor((h - 2 * marginH) / 3);

        // 1. Stroke-Aware Local Polarity Detection (3x3 Grid)
        for (let gy = 0; gy < 3; gy++) {
            for (let gx = 0; gx < 3; gx++) {
                let brightEdges = 0, darkEdges = 0, minL = 255, maxL = 0;
                const rX = marginW + gx * sampleW, rY = marginH + gy * sampleH;
                for (let y = rY; y < rY + sampleH && y < h - 1; y++) {
                    for (let x = rX; x < rX + sampleW && x < w - 1; x++) {
                        const i = (y * w + x) * 4;
                        const l = (d2[i] + d2[i + 1] + d2[i + 2]) / 3;
                        if (l < minL) minL = l; if (l > maxL) maxL = l;
                        const rL = (d2[i + 4] + d2[i + 5] + d2[i + 6]) / 3;
                        const bL = (d2[i + w * 4] + d2[i + w * 4 + 1] + d2[i + w * 4 + 2]) / 3;
                        if (l > rL + 20) brightEdges++; else if (l < rL - 20) darkEdges++;
                        if (l > bL + 20) brightEdges++; else if (l < bL - 20) darkEdges++;
                    }
                }
                if (maxL - minL > 25) {
                    if (brightEdges > darkEdges) brightRegions++;
                    else if (darkEdges > brightEdges) darkRegions++;
                }
            }
        }
        const textIsBright = brightRegions > darkRegions;

        // 2. Main Processing Pass (Polarity, Threshold, Flattening)
        for (let i = 0; i < d2.length; i += 4) {
            let l = (d2[i] + d2[i + 1] + d2[i + 2]) / 3;
            if (textIsBright) l = 255 - l;
            if (l < 55) l = 0;
            else if (l > 200) l = 255;
            else l = (l < 128) ? 0 : 255;
            d2[i] = d2[i + 1] = d2[i + 2] = l;
        }

        // 3. Spatial Cleanup (Halo Removal)
        const ref = new Uint8Array(d2);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = (y * w + x) * 4;
                const center = ref[i];
                let sameCount = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        if (ref[((y + ky) * w + (x + kx)) * 4] === center) sameCount++;
                    }
                }
                if (sameCount < 3) {
                    const flipped = 255 - center;
                    d2[i] = d2[i + 1] = d2[i + 2] = flipped;
                }
            }
        }
        id.data.set(d2);
    }
    ctx.putImageData(id, 0, 0);
    return lr_addPadding(res, 10);
}

// Enhancements
function lr_upscale(canvas, f) {
    const res = document.createElement('canvas'); res.width = canvas.width * f; res.height = canvas.height * f;
    const ctx = res.getContext('2d');
    ctx.imageSmoothingEnabled = false; // PATCH 2 (Fix lr_upscale)
    ctx.drawImage(canvas, 0, 0, res.width, res.height); return res;
}

function lr_addPadding(canvas, pad) {
    const res = document.createElement('canvas');
    res.width = canvas.width + pad * 2;
    res.height = canvas.height + pad * 2;
    const ctx = res.getContext('2d');
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, res.width, res.height);
    ctx.drawImage(canvas, pad, pad);
    return res;
}

function lr_isolateTextbox(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    if (h < 100) return canvas;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const projection = new Float32Array(h);
    for (let y = 1; y < h - 1; y++) {
        let sum = 0;
        for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            sum += Math.abs(d[idx] - d[idx + 4]) + Math.abs(d[idx] - d[idx + w * 4]);
        }
        projection[y] = sum / w;
    }
    let bestBand = { start: 0, end: h, avg: 0 };
    const bandH = Math.floor(h * 0.25);
    for (let y = 0; y < h - bandH; y++) {
        let sum = 0; for (let i = 0; i < bandH; i++) sum += projection[y + i];
        const avg = sum / bandH;
        if (avg > bestBand.avg) bestBand = { start: y, end: y + bandH, avg: avg };
    }
    if (bestBand.avg < 10) return canvas;
    const padTop = 20;
    const padBottom = 80;
    const start = Math.max(0, bestBand.start - padTop);
    const end = Math.min(h, bestBand.end + padBottom);
    const res = document.createElement('canvas'); res.width = w; res.height = end - start;
    res.getContext('2d').drawImage(canvas, 0, start, w, end - start, 0, 0, w, end - start);
    return res;
}

function lr_reconstructStrokes(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const edges = new Float32Array(w * h);
    const kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1], ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let gx = 0, gy = 0;
            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    const v = (d[((y + i) * w + (x + j)) * 4] + d[((y + i) * w + (x + j)) * 4 + 1] + d[((y + i) * w + (x + j)) * 4 + 2]) / 3;
                    gx += v * kx[(i + 1) * 3 + (j + 1)]; gy += v * ky[(i + 1) * 3 + (j + 1)];
                }
            }
            edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
        }
    }
    const dilated = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let m = 0;
            for (let iy = -1; iy <= 1; iy++) {
                for (let ix = -1; ix <= 1; ix++) {
                    const v = edges[(y + iy) * w + (x + ix)];
                    if (v > m) m = v;
                }
            }
            dilated[y * w + x] = m;
        }
    }
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
        const g = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
        const v = Math.min(255, (g * 0.6) + (dilated[i] * 0.4));
        out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
        out.data[i * 4 + 3] = 255;
    }
    const res = document.createElement('canvas'); res.width = w; res.height = h;
    res.getContext('2d').putImageData(out, 0, 0);
    return res;
}

/** Returns new canvas. Applies 3x3 median filter per channel. */
function medianFilter(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const output = ctx.createImageData(w, h);
    const od = output.data;
    // Copy source pixels to output first (preserves 1px border)
    od.set(d);
    // Median-of-9 via partial sorting network (avoids Array.sort per pixel)
    const v = new Uint8Array(9);
    function swap(a, b) { if (v[a] > v[b]) { const t = v[a]; v[a] = v[b]; v[b] = t; } }
    function median9() {
        swap(0,1); swap(3,4); swap(6,7);
        swap(1,2); swap(4,5); swap(7,8);
        swap(0,1); swap(3,4); swap(6,7);
        swap(0,3); swap(3,6); swap(1,4);
        swap(4,7); swap(2,5); swap(5,8);
        swap(1,3); swap(5,7); swap(2,6);
        swap(4,6); swap(2,4); swap(2,3);
        swap(5,6); swap(4,5);
        return v[4];
    }
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        v[k++] = d[((y + ky) * w + (x + kx)) * 4 + c];
                    }
                }
                od[(y * w + x) * 4 + c] = median9();
            }
            od[(y * w + x) * 4 + 3] = 255;
        }
    }
    const resCanvas = document.createElement('canvas');
    resCanvas.width = w; resCanvas.height = h;
    resCanvas.getContext('2d').putImageData(output, 0, 0);
    return resCanvas;
}

/** Returns a new inverted canvas. */
function invertCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
    }
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    out.getContext('2d').putImageData(id, 0, 0);
    return out;
}

function sharpenCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const output = ctx.createImageData(w, h);
    const od = output.data;
    // Copy source pixels to output first (preserves 1px border)
    od.set(d);
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        sum += d[((y + ky) * w + (x + kx)) * 4 + c] * kernel[(ky + 1) * 3 + (kx + 1)];
                    }
                }
                od[(y * w + x) * 4 + c] = Math.min(255, Math.max(0, sum));
            }
            od[(y * w + x) * 4 + 3] = 255;
        }
    }
    const resCanvas = document.createElement('canvas');
    resCanvas.width = w; resCanvas.height = h;
    resCanvas.getContext('2d').putImageData(output, 0, 0);
    return resCanvas;
}

// Pipelines
async function runLastResortOCR(cropCanvas, gen) {
    setOCRStatus('processing', '⚡ Isolating Textbox...');
    const textbox = lr_isolateTextbox(cropCanvas);

    const padded = lr_addPadding(textbox, 1);
    setOCRStatus('processing', '⚡ Reconstructing Strokes...');
    const base = lr_reconstructStrokes(lr_upscale(padded, 2));

    const passes = [];
    const cancelled = () => captureGeneration !== gen;
    const run = async (c, lbl) => { if (cancelled()) return; setOCRStatus('processing', lbl); const r = await runTesseract(c); r.canvas = c; passes.push(r); };

    await run(base, '⚡ Last Resort (1/7)...');
    await run(lr_upscale(base, 2), '⚡ Last Resort (2/7)...');
    await run(applyPreprocessing(base, 'grayscale'), '⚡ Last Resort (3/7)...');
    await run(applyPreprocessing(lr_upscale(lr_isolateTextbox(cropCanvas), 2), 'adaptive'), '⚡ Last Resort (4/7)...');
    await run(applyPreprocessing(base, 'adaptive'), '⚡ Last Resort (5/7)...');
    await run(applyPreprocessing(base, 'binarize'), '⚡ Last Resort (6/7)...');
    await run(applyPreprocessing(lr_upscale(base, 2), 'adaptive'), '⚡ Last Resort (7/7)...');

    const result = passes.length > 0 ? fuseOCRResults(passes) : { text: '', canvas: base };
    result.canvas = base;
    return result;
}

async function runMultiPassOCR(crop, gen) {
    const passes = [];
    const cancelled = () => captureGeneration !== gen;
    const run = async (c, lbl) => { if (cancelled()) return; setOCRStatus('processing', lbl); const r = await runTesseract(c); r.canvas = c; passes.push(r); };
    const upscaled = lr_upscale(crop, 2);
    await run(crop, '🔥 Multi-Pass (1/5)...');
    await run(upscaled, '🔥 Multi-Pass (2/5)...');
    await run(applyPreprocessing(upscaled, 'grayscale'), '🔥 Multi-Pass (3/5)...');
    await run(applyPreprocessing(upscaled, 'binarize'), '🔥 Multi-Pass (4/5)...');
    await run(applyPreprocessing(upscaled, 'adaptive'), '🔥 Multi-Pass (5/5)...');
    const result = passes.length > 0 ? fuseOCRResults(passes) : { text: '', canvas: crop };
    return result;
}

function fuseOCRResults(results) {
    const jaRegex = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g;
    // Scoring rationale:
    // - confidence: Tesseract's self-reported quality (0-100)
    // - jaDensity: ratio of Japanese Unicode chars to total chars
    //   Higher density = more likely to be real Japanese text vs noise
    // - +0.1 bias: prevents zero-score for results with some Japanese
    // - 2x bonus when jaDensity > 0.3: rewards predominantly Japanese results
    // - 0.5x penalty below 0.3: deprioritizes noisy results
    // These thresholds were hand-tuned. Future: validate against labeled dataset.
    const scored = results.map(r => {
        const text = (r.text || "").replace(/\s+/g, '').trim();
        if (!text) return { text: "", score: -1, canvas: r.canvas };
        const jaMatches = text.match(jaRegex) || [];
        const jaDensity = jaMatches.length / text.length;
        const score = (r.confidence || 0) * (jaDensity + 0.1) * (jaDensity > 0.3 ? 2 : 0.5);
        return { text, score, canvas: r.canvas };
    }).filter(r => r.score > 0);
    if (scored.length === 0) return { text: "", canvas: results[0].canvas };
    scored.sort((a, b) => b.score - a.score || b.text.length - a.text.length);
    return scored[0];
}

async function runTesseract(canvas) {
    if (!isOcrReady || !ocrWorker) return { text: "", confidence: 0 };
    try {
        const { data: { text, confidence } } = await ocrWorker.recognize(canvas);
        return { text: text || "", confidence: confidence || 0 };
    }
    catch (e) { return { text: "", confidence: 0 }; }
}

function addOCRResultToUI(text) {
    const clean = text.replace(/\s+/g, '').trim(); if (!clean) return;
    if (latestText) latestText.textContent = clean;

    const item = document.createElement('p');
    item.className = 'history-item';
    item.setAttribute('lang', 'ja');

    const span = document.createElement('span');
    span.textContent = clean;
    item.appendChild(span);

    const btnRow = document.createElement('div');
    btnRow.className = 'item-btns';

    const speakBtn = document.createElement('button');
    speakBtn.setAttribute('data-action', 'speak');
    speakBtn.textContent = '🔊';
    speakBtn.ariaLabel = "Speak line";

    const copyBtn = document.createElement('button');
    copyBtn.setAttribute('data-action', 'copy');
    copyBtn.textContent = '📋';
    copyBtn.ariaLabel = "Copy line";

    btnRow.append(speakBtn, copyBtn);
    item.appendChild(btnRow);

    if (historyContent) {
        historyContent.prepend(item);
        while (historyContent.children.length > 100) historyContent.removeChild(historyContent.lastChild);

        const items = Array.from(historyContent.querySelectorAll('span')).map(s => s.textContent);
        localStorage.setItem('vn-ocr-public-history-v2', JSON.stringify(items));
    }
}

if (clearHistoryBtn) {
    clearHistoryBtn.onclick = () => {
        if (historyContent) historyContent.innerHTML = '';
        if (latestText) latestText.textContent = 'Waiting for capture...';
        localStorage.removeItem('vn-ocr-public-history-v2');
        localStorage.removeItem('vn-ocr-public-history');
    };
}

if (refreshOcrBtn) refreshOcrBtn.onclick = () => { if (selectionRect) captureFrame(selectionRect); };

function initHelpModal() {
    const helpBtn = document.getElementById('help-btn'), helpModal = document.getElementById('help-modal'), helpClose = document.getElementById('help-close');
    if (!helpBtn || !helpModal) return;
    helpBtn.onclick = (e) => { e.stopPropagation(); helpModal.classList.add('active'); };
    if (helpClose) helpClose.onclick = () => helpModal.classList.remove('active');
    window.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.remove('active'); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') helpModal.classList.remove('active'); });
}

// ==========================================
// 6. Settings & PaddleOCR Implementation
// ==========================================

async function loadPaddleOCR() {
    if (window.paddleProvider && window.paddleProvider.isLoaded) {
        setOCRStatus('ready', '🟢 PaddleOCR Ready');
        return;
    }
    if (isProcessing) return;
    isProcessing = true;
    try {
        window.paddleProvider = new PaddleOCR(
            './models/paddle/manifest.json',
            './js/onnx/',
            (msg) => setOCRStatus('loading', msg)
        );
        await window.paddleProvider.loadModels();
        setOCRStatus('ready', '🟢 PaddleOCR Ready');
    } catch (err) {
        console.error('Failed to load PaddleOCR', err);
        setOCRStatus('error', '🔴 PaddleOCR Load Failed');
        window.paddleProvider = null;
        if (engineSelector) engineSelector.value = previousMode;
        setSetting('ocrMode', previousMode);
    } finally {
        isProcessing = false;
    }
}

// 6.1 Initialization
function initSettings() {
    loadSettings();
    applySettingsToUI();

    // Startup Banner Logic
    const mode = getSetting('ocrMode');
    const showWarning = getSetting('showHeavyWarning');
    if (mode === 'paddle' && showWarning) {
        document.getElementById('startup-banner')?.classList.add('active');
    }
}

// 6.2 PaddleOCR Toggle and Warning Logic
// Normalize current engine state from settings
let previousMode = (getSetting('ocrMode') === 'paddle') ? 'paddle' : 'tesseract';

async function switchEngine(newMode, force = false) {
    // Re-entry guard: don't reload if already active (unless forced)
    const isCurrentLoaded = (newMode === 'tesseract' && ocrWorker) || (newMode === 'paddle' && window.paddleProvider?.isLoaded);
    if (!force && newMode === previousMode && isCurrentLoaded) return;

    // Teardown previous engine
    if (previousMode === 'tesseract' && ocrWorker) {
        ocrWorker.terminate();
        ocrWorker = null;
    }

    if (previousMode === 'paddle' && window.paddleProvider) {
        await window.paddleProvider.dispose();
        window.paddleProvider = null;
    }

    // Update settings + state
    previousMode = newMode;
    setSetting('ocrMode', newMode);

    // Sync preprocessing UI
    if (typeof modeSelector !== 'undefined' && modeSelector) {
        modeSelector.disabled = (newMode === 'paddle');
        
        // Ensure preprocessing mode is always valid when using Tesseract
        if (newMode === 'tesseract') {
            modeSelector.value = 'default_mini';
            setSetting('ocrMode', 'default_mini');
        }
    }

    // Load new engine
    if (newMode === 'tesseract') {
        await initOCR();
    } else if (newMode === 'paddle') {
        await loadPaddleOCR();
    }
}

engineSelector.addEventListener('change', async () => {
    const newMode = engineSelector.value;

    // Intercept PaddleOCR if warnings are enabled
    if (newMode === 'paddle' && getSetting('showHeavyWarning')) {
        engineSelector.value = previousMode;
        document.getElementById('paddle-modal').classList.add('active');
        return;
    }

    // Normal engine switch
    await switchEngine(newMode);
});


// 6.3 Modal Event Listeners
document.getElementById('paddle-continue')?.addEventListener('click', async () => {
    const checkbox = document.getElementById('heavy-warning-checkbox');
    if (checkbox?.checked) {
        setSetting('showHeavyWarning', false);
    }

    engineSelector.value = 'paddle';
    await switchEngine('paddle');

    document.getElementById('paddle-modal').classList.remove('active');
});

document.getElementById('paddle-cancel')?.addEventListener('click', () => {
    engineSelector.value = previousMode;
    document.getElementById('paddle-modal').classList.remove('active');
});

// 6.4 Banner Event Listeners
document.getElementById('banner-switch-default')?.addEventListener('click', () => {
    setSetting('ocrMode', 'default_mini');
    applySettingsToUI();
    document.getElementById('startup-banner').classList.remove('active');
});

document.getElementById('banner-nocall-checkbox')?.addEventListener('change', (e) => {
    setSetting('showHeavyWarning', !e.target.checked);
});

document.getElementById('banner-close')?.addEventListener('click', () => {
    document.getElementById('startup-banner').classList.remove('active');
});

// 6.5 Global Initialization
function globalInitialize() {
    initHelpModal();
    initSettings();

    // UI Synchronization: Ensure the dropdowns match saved settings early
    const savedMode = getSetting('ocrMode');
    const isPaddle = (savedMode === 'paddle');

    if (isPaddle) {
        if (engineSelector) engineSelector.value = 'paddle';
        if (modeSelector) modeSelector.disabled = true;
    } else {
        if (engineSelector) engineSelector.value = 'tesseract';
        if (modeSelector) {
            // On first load, ensure mode selector is valid
            modeSelector.disabled = false;
            modeSelector.value = savedMode || 'default_mini';
        }
    }

    // Startup Engine Load: Load the saved engine exactly once
    switchEngine(isPaddle ? 'paddle' : 'tesseract');



    // Service Worker with update notification
    if ('serviceWorker' in navigator) {
        const disableViaParam = new URLSearchParams(location.search).has('no-sw');
        const disableViaStorage = localStorage.getItem('vn-ocr-disable-sw') === 'true';
        if (disableViaParam || disableViaStorage) {
            navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        } else {
            navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW registration failed:', e));
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                const bar = document.createElement('div');
                bar.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:10px;background:var(--accent);color:#000;text-align:center;font-weight:700;z-index:99999;cursor:pointer;';
                bar.textContent = 'Update available — click to refresh';
                bar.onclick = () => location.reload();
                document.body.appendChild(bar);
            });
        }
    }

    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
        const installBtn = document.getElementById('install-btn');
        if (installBtn) installBtn.style.display = 'none';
    }

    if (refreshOcrBtn) refreshOcrBtn.ariaLabel = "Manual Re-Capture";
    if (autoToggle?.parentElement) autoToggle.parentElement.ariaLabel = "Toggle Automation";

    // History Loading (batch — avoid N localStorage writes)
    if (historyContent) {
        const savedV2 = localStorage.getItem('vn-ocr-public-history-v2');
        if (savedV2) {
            const lines = JSON.parse(savedV2);
            lines.reverse().forEach(line => {
                const clean = line.replace(/\s+/g, '').trim();
                if (!clean) return;
                const item = document.createElement('p');
                item.className = 'history-item';
                item.setAttribute('lang', 'ja');
                const span = document.createElement('span');
                span.textContent = clean;
                item.appendChild(span);
                const btnRow = document.createElement('div');
                btnRow.className = 'item-btns';
                const speakBtn = document.createElement('button');
                speakBtn.setAttribute('data-action', 'speak');
                speakBtn.textContent = '🔊';
                speakBtn.ariaLabel = 'Speak line';
                const copyBtn = document.createElement('button');
                copyBtn.setAttribute('data-action', 'copy');
                copyBtn.textContent = '📋';
                copyBtn.ariaLabel = 'Copy line';
                btnRow.append(speakBtn, copyBtn);
                item.appendChild(btnRow);
                historyContent.prepend(item);
            });
            if (historyContent.children.length > 0) {
                latestText.textContent = historyContent.querySelector('span')?.textContent || 'Waiting for capture...';
            }
        }
    }


}

globalInitialize();

/* ========================================== */
/* PHASE 6 — HAMBURGER MENU MIRROR            */
/* ========================================== */

(function () {
    const menuBtn = document.getElementById('menu-btn');
    const sideMenu = document.getElementById('side-menu');
    const menuBackdrop = document.getElementById('menu-backdrop');
    const menuTheme = document.getElementById('menu-theme');
    const menuAuto = document.getElementById('menu-auto');
    const menuCopy = document.getElementById('menu-copy');
    const menuInstall = document.getElementById('menu-install');
    const menuHistory = document.getElementById('menu-history');
    const menuGuide = document.getElementById('menu-guide');

    const openMenu = () => {
        if (sideMenu) sideMenu.classList.add('open');
        if (menuBackdrop) menuBackdrop.classList.add('open');
    };

    const closeMenu = () => {
        if (sideMenu) sideMenu.classList.remove('open');
        if (menuBackdrop) menuBackdrop.classList.remove('open');
    };

    if (menuBtn) menuBtn.onclick = openMenu;
    if (menuBackdrop) menuBackdrop.onclick = (e) => { e.stopPropagation(); closeMenu(); };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    if (menuTheme) menuTheme.onclick = () => {
        const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
        setSetting('theme', next);
        applySettingsToUI();
        closeMenu();
    };

    if (menuAuto) menuAuto.onclick = () => {
        const at = document.getElementById('auto-capture-toggle');
        if (at) at.click(); // Re-use existing toggle logic
        closeMenu();
    };

    if (menuCopy) {
        const updateCopyLabel = () => { menuCopy.textContent = getSetting('autoCopy') ? 'Auto-Copy: ON' : 'Auto-Copy: OFF'; };
        updateCopyLabel();
        menuCopy.onclick = () => {
            setSetting('autoCopy', !getSetting('autoCopy'));
            updateCopyLabel();
            closeMenu();
        };
    }

    if (menuInstall) menuInstall.onclick = () => {
        const it = document.getElementById('install-btn');
        if (it) it.click();
        closeMenu();
    };

    if (menuGuide) menuGuide.onclick = () => {
        const hb = document.getElementById('help-btn');
        if (hb) hb.click();
        closeMenu();
    };

    if (menuHistory) menuHistory.onclick = () => {
        const next = !getSetting('historyVisible');
        setSetting('historyVisible', next);
        applySettingsToUI();
        closeMenu();
    };
})();

