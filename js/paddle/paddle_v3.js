import { fetchWithProgress, canvasToFloat32Tensor, resizeCanvas } from './paddle_core.js';

export const PaddleProviderV3 = {
    version: 'v3',
    loaded: false,
    detSession: null,
    recSession: null,
    dictionary: [],

    async loadModels(onStatus) {
        try {
            onStatus('🟡 Loading detection model...');
            // STUB: Phase 2 fetches manifest.json and loads ONNX sessions
            // await fetchWithProgress('./models/paddle/' + config.det, ...)
            // this.detSession = await ort.InferenceSession.create(buffer, ...)
            await new Promise(r => setTimeout(r, 300)); // simulate load time

            onStatus('🟡 Loading recognition model...');
            // STUB: Phase 2 loads rec model
            await new Promise(r => setTimeout(r, 300));

            onStatus('🟡 Loading dictionary...');
            // STUB: Phase 2 fetches and parses dict file
            // const dictText = await fetch('./models/paddle/' + config.dict).then(r => r.text())
            // this.dictionary = dictText.split('\n')
            await new Promise(r => setTimeout(r, 100));

            this.loaded = true;
            onStatus('🟢 PaddleOCR v3 Ready');
        } catch (err) {
            onStatus('🔴 PaddleOCR load failed: ' + err.message);
            throw err;
        }
    },

    async detect(imageTensor, width, height) {
        // STUB: Phase 2 implements real detection
        // Real: resize to div-by-32, run detSession, threshold bitmap, find contours
        return [{ x: 0, y: 0, w: width, h: height }]; // return full image as single box
    },

    async recognize(crops) {
        // STUB: Phase 2 implements real recognition
        // Real: resize to h=48, run recSession, CTC decode with dictionary
        return [{ text: '[PaddleOCR stub]', confidence: 0 }];
    },

    dispose() {
        if (this.detSession) { this.detSession.release(); this.detSession = null; }
        if (this.recSession) { this.recSession.release(); this.recSession = null; }
        this.dictionary = [];
        this.loaded = false;
    }
};
