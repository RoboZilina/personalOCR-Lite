import { fetchWithProgress, canvasToFloat32Tensor } from './paddle_core.js';

export class PaddleOCR {
    constructor(manifestUrl, wasmBasePath, updateStatus) {
        this.id = 'paddle';
        this.label = 'PaddleOCR';
        this.manifestUrl = manifestUrl;
        this.wasmBasePath = wasmBasePath;
        this.updateStatus = updateStatus;
        this.manifest = null;
        this.detSession = null;
        this.recSession = null;
        this.dict = [];
        this.normalize = { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] };
        this.isLoaded = false;
    }

    /** Interface-compliant initialization */
    async load() {
        return await this.loadModels();
    }

    async loadModels() {
        try {
            this.updateStatus('PaddleOCR: loading manifest…');
            const res = await fetch(this.manifestUrl);
            this.manifest = await res.json();

            // Standardize model base path
            const modelBase = "./models/paddle/";

            if (this.manifest.normalize) {
                this.normalize = this.manifest.normalize;
            }

            // Configure ONNX Runtime WASM
            // ort.env.wasm.wasmPaths = "js/onnx/"; 
            ort.env.wasm.numThreads = 1; 
            ort.env.wasm.simd = true;

            // Load detection model
            this.updateStatus('PaddleOCR: loading detection model…');
            let detBuffer = await fetchWithProgress(
                modelBase + this.manifest.det.path,
                (p) => this.updateStatus(`PaddleOCR: Loading ${(p * 50).toFixed(0)}%`)
            );
            this.detSession = await ort.InferenceSession.create(detBuffer);
            detBuffer = null; // Memory Guard: Release buffer immediately after session creation
            await new Promise(resolve => setTimeout(resolve, 50)); // Memory Guard: Yield to allow GC breathing room

            // Load recognition model
            this.updateStatus('PaddleOCR: loading recognition model…');
            let recBuffer = await fetchWithProgress(
                modelBase + this.manifest.rec.path,
                (p) => this.updateStatus(`PaddleOCR: Loading ${(50 + p * 50).toFixed(0)}%`)
            );
            this.recSession = await ort.InferenceSession.create(recBuffer);
            recBuffer = null; // Memory Guard: Release buffer

            // Load dictionary
            this.updateStatus('PaddleOCR: loading dictionary…');
            const dictRes = await fetch(modelBase + this.manifest.dict.path);
            const dictText = await dictRes.text();
            this.dict = dictText.split(/\r?\n/);
            if (this.dict.length > 0 && this.dict[this.dict.length - 1] === "") {
                this.dict.pop();
            }

            this.isLoaded = true;
            this.updateStatus('PaddleOCR: ready.');
        } catch (err) {
            console.error("PaddleOCR: Load Error:", err);
            this.updateStatus('PaddleOCR: Load Failed.');
            throw err;
        }
    }

    async detect(canvas) {
        if (!this.detSession) return { boxes: [] };

        try {

            const inputSize = this.manifest.det.input_size || [960, 960];
            const [h, w] = inputSize;

            const tensorData = canvasToFloat32Tensor(canvas, inputSize, this.normalize);
            if (!tensorData) return { boxes: [] };
            
            const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, h, w]);

            const feeds = {};
            feeds[this.detSession.inputNames[0]] = inputTensor;

            const output = await this.detSession.run(feeds);
            const outputName = this.detSession.outputNames[0];
            const map = output[outputName].data;
            const dims = output[outputName].dims;

            const mapH = dims[2];
            const mapW = dims[3];

            const boxes = this._extractBoxesFromMap(map, mapH, mapW, canvas.width, canvas.height);

            
            // Memory Cleanup
            feeds[this.detSession.inputNames[0]] = null;
            
            return { boxes };
        } catch (err) {
            console.error("PaddleOCR: Detection Error:", err);
            return { boxes: [] };
        }
    }

    _extractBoxesFromMap(map, mapH, mapW, origW, origH) {
        try {
            const threshold = 0.6;
            const visited = new Uint8Array(mapH * mapW);
            const boxes = [];

            const idx = (y, x) => y * mapW + x;

            for (let y = 0; y < mapH; y++) {
                for (let x = 0; x < mapW; x++) {
                    const v = map[idx(y, x)];
                    if (v < threshold || visited[idx(y, x)]) continue;

                    let minX = x, maxX = x, minY = y, maxY = y;
                    const stack = [[x, y]];
                    visited[idx(y, x)] = 1;

                    while (stack.length) {
                        const [cx, cy] = stack.pop();

                        minX = Math.min(minX, cx);
                        maxX = Math.max(maxX, cx);
                        minY = Math.min(minY, cy);
                        maxY = Math.max(maxY, cy);

                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const nx = cx + dx;
                                const ny = cy + dy;
                                if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;

                                const nIdx = idx(ny, nx);
                                if (visited[nIdx]) continue;
                                if (map[nIdx] < threshold) continue;

                                visited[nIdx] = 1;
                                stack.push([nx, ny]);
                            }
                        }
                    }

                    const scaleX = origW / mapW;
                    const scaleY = origH / mapH;

                    // 1. Apply padding in detection-space BEFORE scaling
                    const padLeft   = 20; 
                    const padRight  = 12;
                    const padTop    = 12;
                    const padBottom = 12;

                    let pMinX = Math.max(0, minX - padLeft);
                    let pMinY = Math.max(0, minY - padTop);
                    let pMaxX = Math.min(mapW, maxX + padRight + 1);
                    let pMaxY = Math.min(mapH, maxY + padBottom + 1);

                    // 2. THEN scale to original image coordinates
                    const x1 = pMinX * scaleX;
                    const y1 = pMinY * scaleY;
                    const x2 = pMaxX * scaleX;
                    const y2 = pMaxY * scaleY;

                    // Noise-box filtering
                    const w = x2 - x1;
                    const h = y2 - y1;
                    if (w < 20 || h < 10) {
                        continue; // skip tiny noise boxes
                    }

                    boxes.push([x1, y1, x2, y2]);
                }
            }
            return boxes;
        } catch (err) {
            console.error("PaddleOCR: Box Extraction Error:", err);
            return [];
        }
    }

    async recognize(cropCanvas) {
        if (!this.recSession) return '';

        try {

            const inputSize = this.manifest.rec.input_size || [32, 320];
            const [h, w] = inputSize;

            const tensorData = canvasToFloat32Tensor(cropCanvas, inputSize, this.normalize);
            if (!tensorData) return '';
            
            const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, h, w]);

            const feeds = {};
            feeds[this.recSession.inputNames[0]] = inputTensor;

            const output = await this.recSession.run(feeds);
            const outputName = this.recSession.outputNames[0];
            const out = output[outputName];

            let logits = out.data;
            let dims = out.dims;

            if (dims.length === 4) {
                dims = [dims[0], dims[2], dims[3]];
            } else if (dims.length === 2) {
                dims = [1, dims[0], dims[1]];
            }

            const text = this._ctcGreedyDecode(logits, dims);

            
            // Memory Cleanup
            feeds[this.recSession.inputNames[0]] = null;
            logits = null;
            
            return text;
        } catch (err) {
            console.error("PaddleOCR: Recognition Error:", err);
            return '';
        }
    }

    _ctcGreedyDecode(logits, dims) {
        try {
            const [batch, timeSteps, numClasses] = dims;
            const texts = [];

            for (let b = 0; b < batch; b++) {
                let prev = -1;
                const chars = [];
                for (let t = 0; t < timeSteps; t++) {
                    let maxIdx = 0;
                    let maxVal = -Infinity;
                    for (let c = 0; c < numClasses; c++) {
                        const idx = b * timeSteps * numClasses + t * numClasses + c;
                        const v = logits[idx];
                        if (v > maxVal) {
                            maxVal = v;
                            maxIdx = c;
                        }
                    }
                    if (maxIdx !== 0 && maxIdx !== prev) {
                        const dictIdx = maxIdx - 1;
                        if (dictIdx >= 0 && dictIdx < this.dict.length) {
                            chars.push(this.dict[dictIdx]);
                        }
                    }
                    prev = maxIdx;
                }
                texts.push(chars.join(''));
            }
            return { text: texts[0] || '' };
        } catch (err) {
            console.error("PaddleOCR: CTC Decoding Error:", err);
            return { text: '' };
        }
    }

    dispose() {
        // Explicit Session Disposal (if supported)
        try {
            if (this.detSession) {
                if (typeof this.detSession.release === 'function') this.detSession.release();
                else if (this.detSession.handler && typeof this.detSession.handler.dispose === 'function') this.detSession.handler.dispose();
            }
            if (this.recSession) {
                if (typeof this.recSession.release === 'function') this.recSession.release();
                else if (this.recSession.handler && typeof this.recSession.handler.dispose === 'function') this.recSession.handler.dispose();
            }
        } catch (e) {
            console.warn("PaddleOCR: Error during session release", e);
        }
        
        this.detSession = null;
        this.recSession = null;
        this.dict = [];
        this.isLoaded = false;
    }
}
