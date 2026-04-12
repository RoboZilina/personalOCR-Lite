export class TesseractEngine {
    constructor(options = {}) {
        this.id = 'tesseract';
        this.label = 'Tesseract';
        this.isLoaded = false;
        this.worker = null;
        this.reportStatus = options.reportStatus || (() => {});
    }

    /**
     * Initializes the Tesseract worker and loads the 'jpn_best' model.
     * Configuration matches the existing app.js implementation for consistency.
     */
    async load() {
        if (this.isLoaded && this.worker) return;

        try {
            // Configuration for jpn_best as per legacy app.js logic
            const langPath = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_best@4.0.0/';
            const useGzip = false;
            const actualLang = 'jpn';

            this.worker = await Tesseract.createWorker(actualLang, 1, {
                langPath: langPath,
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
