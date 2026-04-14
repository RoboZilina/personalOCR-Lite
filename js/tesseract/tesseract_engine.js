export class TesseractEngine {
    constructor(options = {}) {
        this.id = 'tesseract';
        this.label = 'Tesseract';
        this.isLoaded = false;
        this.worker = null;
        this.reportStatus = options.reportStatus || (() => {});
    }

    /**
     * Non-blocking check for local asset existence (Hardening v2.1.9).
     * Pings the WASM and Worker files to ensure the environment is correctly deployed.
     */
    async checkAssets() {
        const assets = [
            './js/tesseract/worker.min.js',
            './js/tesseract/tesseract-core.wasm.js',
            './models/jpn.traineddata'
        ];
        
        try {
            const results = await Promise.all(assets.map(url => fetch(url, { method: 'HEAD' })));
            const allFound = results.every(res => res.ok);
            
            const diagAssets = document.getElementById('diag-assets');
            if (diagAssets) {
                diagAssets.textContent = allFound ? '✅ FOUND' : '❌ MISSING';
                diagAssets.className = allFound ? 'diag-status-ok' : 'diag-status-fail';
            }
            return allFound;
        } catch (err) {
            console.warn("Asset integrity check failed (possible CORS or network issue):", err);
            return false;
        }
    }

    /**
     * Initializes the Tesseract worker and loads the 'jpn_best' model.
     * Configuration matches the existing app.js implementation for consistency.
     */
    async load() {
        if (this.isLoaded && this.worker) return;

        // Non-blocking integrity ping
        this.checkAssets();

        try {
            // Configuration for strictly local operation (Lite Version)
            const langPath = './models/';
            const useGzip = false;
            const actualLang = 'jpn';

            this.worker = await Tesseract.createWorker(actualLang, 1, {
                langPath: langPath,
                workerPath: './js/tesseract/worker.min.js',
                corePath: './js/tesseract/tesseract-core.wasm.js',
                gzip: useGzip,
                logger: m => {
                    if (m.status === 'loading language traineddata') {
                        const pct = Math.round(m.progress * 100);
                        this.reportStatus('loading', `🟡 Loading Data ${pct}%`);
                    }
                }
            });

            // Tesseract-specific parameters for VN text blocks
            await this.worker.setParameters({
                tessedit_pageseg_mode: '6'
            });

            this.reportStatus('backend', { type: 'wasm' });
            this.isLoaded = true;
        } catch (err) {
            console.error("TesseractEngine: Load Error:", err);
            this.isLoaded = false;
            throw err;
        }
    }

    /**
     * Terminates the worker and clears references.
     */
    async dispose() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
        this.isLoaded = false;
    }

    /**
     * Performs OCR on the provided canvas.
     * @param {HTMLCanvasElement} canvas 
     * @returns {Promise<{text: string}>}
     */
    async recognize(canvas) {
        if (!this.isLoaded || !this.worker) {
            return { text: '' };
        }

        try {
            const { data: { text } } = await this.worker.recognize(canvas);
            return { text: text || '' };
        } catch (err) {
            console.error("TesseractEngine: Recognition Error:", err);
            return { text: '' };
        }
    }
}
