// Shared canvas to reduce GC pressure
const sharedCanvas = document.createElement('canvas');
const sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });

// Pre-allocated buffers for common OCR sizes to reduce allocation churn
let detInputBuffer = null;
let recInputBuffer = null;

// url: string, onProgress: (fraction: number) => void
export async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

    const contentLength = response.headers.get('Content-Length');
    if (!contentLength) {
        const buffer = await response.arrayBuffer();
        if (onProgress) onProgress(1);
        return buffer;
    }

    const total = parseInt(contentLength, 10);
    let loaded = 0;
    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (onProgress) onProgress(loaded / total);
    }

    const blob = new Blob(chunks);
    const buffer = await blob.arrayBuffer();
    if (onProgress) onProgress(1);
    return buffer;
}

// canvas: HTMLCanvasElement, inputSize: [H, W], normalize: { mean: number[], std: number[] }
export function canvasToFloat32Tensor(canvas, inputSize, normalize) {
    if (!canvas || !inputSize || !normalize) return null;
    
    try {
        const [targetH, targetW] = inputSize;
        
        // Clear shared canvas
        sharedCanvas.width = targetW;
        sharedCanvas.height = targetH;
        sharedCtx.fillStyle = '#000000'; // Black padding (Trial A)
        sharedCtx.fillRect(0, 0, targetW, targetH);

        // Aspect-ratio preserve resize for recognition
        if (targetH === 48) {
            const scale = targetH / canvas.height;
            const resW = Math.min(targetW, Math.round(canvas.width * scale));
            sharedCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, resW, targetH);
        } else {
            // Standard stretch for detection models
            sharedCtx.drawImage(canvas, 0, 0, targetW, targetH);
        }

        const imageData = sharedCtx.getImageData(0, 0, targetW, targetH);
        const { data } = imageData; // Uint8ClampedArray

        const mean = normalize.mean;
        const std = normalize.std;

        // Determine which buffer to use
        let chw;
        const size = 3 * targetH * targetW;
        if (targetH === 960 && targetW === 960) {
            if (!detInputBuffer) detInputBuffer = new Float32Array(size);
            chw = detInputBuffer;
        } else if (targetH === 48 && targetW === 320) {
            if (!recInputBuffer) recInputBuffer = new Float32Array(size);
            chw = recInputBuffer;
        } else {
            chw = new Float32Array(size);
        }

        let idx = 0;
        for (let y = 0; y < targetH; y++) {
            for (let x = 0; x < targetW; x++) {
                const i = (y * targetW + x) * 4;
                const r = data[i] / 255;
                const g = data[i + 1] / 255;
                const b = data[i + 2] / 255;

                // Trial A: BGR color order [B, G, R]
                chw[0 * targetH * targetW + idx] = (b - mean[2]) / std[2];
                chw[1 * targetH * targetW + idx] = (g - mean[1]) / std[1];
                chw[2 * targetH * targetW + idx] = (r - mean[0]) / std[0];

                idx++;
            }
        }

        // Return a fresh TypedArray view if using shared buffer, 
        // OR the new array. Note: ONNX Tensor will consume this data.
        // We use .slice() or just return the shared one if the model doesn't mutate it.
        // ORT Tensor.create takes a copy unless it's a specific type.
        return chw;
    } catch (err) {
        console.error("PaddleOCR: Tensor conversion error:", err);
        return null;
    }
}

// Preserve aspect ratio, max width/height
export function resizeCanvas(sourceCanvas, maxWidth, maxHeight) {
    if (!sourceCanvas) return null;

    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    if (srcW === 0 || srcH === 0) return null;

    const scale = Math.min(maxWidth / srcW, maxHeight / srcH, 1);
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    const dst = document.createElement('canvas');
    dst.width = dstW;
    dst.height = dstH;
    const ctx = dst.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sourceCanvas, 0, 0, dstW, dstH);

    return { canvas: dst, scaleX: dstW / srcW, scaleY: dstH / srcH };
}

// Crop a box from the original canvas
// box: [x1, y1, x2, y2] in original coordinates
export function cropBoxFromCanvas(canvas, box) {
    if (!canvas || !box) return null;

    const [x1, y1, x2, y2] = box;

    let w = Math.round(x2 - x1);
    let h = Math.round(y2 - y1);

    // Hard guards for crop sizes
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return null;

    if (w < 4) w = 4;
    if (h < 4) h = 4;

    const dst = document.createElement('canvas');
    dst.width = w;
    dst.height = h;

    const ctx = dst.getContext('2d', { willReadFrequently: true });

    try {
        ctx.drawImage(
            canvas,
            x1, y1, Math.max(1, Math.round(x2-x1)), Math.max(1, Math.round(y2-y1)),
            0, 0, w, h
        );
    } catch (e) {
        console.error("PaddleOCR: Crop draw error:", e);
        return null;
    }

    return dst;
}

// Orchestrate detection + recognition
export async function runPaddleOCR(paddle, canvas, updateStatus) {
    if (!paddle || !canvas) return [];

    try {
        updateStatus('PaddleOCR: detecting text…');
        const { boxes } = await paddle.detect(canvas);

        if (!boxes || boxes.length === 0) {
            return [];
        }

        updateStatus(`PaddleOCR: recognizing ${boxes.length} regions…`);

        const results = [];
        for (const box of boxes) {
            const crop = cropBoxFromCanvas(canvas, box);
            if (!crop) continue;

            const text = await paddle.recognize(crop);
            if (text && text.trim()) {
                results.push({ box, text });
            }
            // Explicitly Clear Crop Canvas
            crop.width = 0; crop.height = 0;
        }

        updateStatus('PaddleOCR: done.');
        return results;
    } catch (err) {
        console.error("PaddleOCR: Pipeline error:", err);
        updateStatus('PaddleOCR: Error.');
        return [];
    }
}
