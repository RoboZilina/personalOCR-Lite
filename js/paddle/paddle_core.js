// --- Provider State ---
let PaddleProvider = null;

export function setPaddleProvider(provider) {
    PaddleProvider = provider;
}

export function getPaddleStatus() {
    if (!PaddleProvider) return { loaded: false, version: null };
    return { loaded: PaddleProvider.loaded, version: PaddleProvider.version };
}

export async function loadPaddleModels(onStatus) {
    if (!PaddleProvider) throw new Error('No PaddleOCR provider set');
    await PaddleProvider.loadModels(onStatus);
    return getPaddleStatus();
}

export async function runPaddleOCR(canvas) {
    if (!PaddleProvider || !PaddleProvider.loaded) {
        throw new Error('PaddleOCR not loaded');
    }
    // STUB: Phase 2 replaces this with real pipeline
    // Real pipeline: canvasToFloat32Tensor → detect → cropBoxes → recognize → join
    return { text: '[PaddleOCR stub — no model loaded]', confidence: 0 };
}

export function disposePaddle() {
    if (PaddleProvider && PaddleProvider.dispose) {
        PaddleProvider.dispose();
    }
    PaddleProvider = null;
}

// --- Utility Stubs (Phase 2 fills these in) ---

export function fetchWithProgress(url, onProgress) {
    // STUB: Phase 2 adds ReadableStream progress tracking
    return fetch(url).then(r => r.arrayBuffer());
}

export function canvasToFloat32Tensor(canvas) {
    // STUB: Phase 2 implements ImageData → Float32Array [1, 3, H, W]
    return new Float32Array(0);
}

export function resizeCanvas(canvas, targetH, maxW) {
    // STUB: Phase 2 implements aspect-ratio-preserving resize
    return canvas;
}

export function cropBoxFromCanvas(canvas, box) {
    // STUB: Phase 2 implements sub-region crop
    return canvas;
}
