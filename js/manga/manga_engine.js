/**
 * MangaOCR Engine Implementation (Dual-Session / Optimum Path)
 * Industry-standard Encoder + Decoder architecture for autoregressive inference.
 */
export class MangaOCREngine {
    constructor() {
        this.id = 'manga';
        this.label = 'MangaOCR';
        this.isLoaded = false;
        
        this.encoderSession = null;
        this.decoderSession = null;
        this.vocab = null;

        // Preprocessing constants — normalization stats loaded from preprocessor_config.json at runtime
        this.RESIZE_DIM = 224;
        this.MAX_LENGTH = 300; // matches official manga-ocr generate(max_length=300)
        this.imageMean = null;
        this.imageStd = null;
        // Token IDs loaded from config.json at runtime (model-specific)
        this.BOS_TOKEN_ID = null;
        this.EOS_TOKEN_ID = null;
    }

    /**
     * Initializes the dual ONNX sessions.
     */
    async load(
        encoderPath = 'https://github.com/RoboZilina/personalOCR/releases/download/manga-models-v1.0/encoder_model.onnx',
        decoderPath = 'https://github.com/RoboZilina/personalOCR/releases/download/manga-models-v1.0/decoder_model.onnx',
        vocabPath = 'https://github.com/RoboZilina/personalOCR/releases/download/manga-models-v1.0/vocab.json',
        configPath = './models/manga/config.json',
        preprocessorPath = './models/manga/preprocessor_config.json'
    ) {
        if (this.isLoaded && this.encoderSession && this.decoderSession) return;

        try {
            console.debug(`[MANGA-DEBUG] Loading Dual-Session Models...`);
            
            // Initialize sessions and all config files in parallel
            const [enc, dec, vocabRes, configRes, preprocRes] = await Promise.all([
                ort.InferenceSession.create(encoderPath),
                ort.InferenceSession.create(decoderPath),
                fetch(vocabPath),
                fetch(configPath),
                fetch(preprocessorPath)
            ]);

            this.encoderSession = enc;
            this.decoderSession = dec;
            this.vocab = await vocabRes.json();

            // Read token IDs from model config — never hardcode model-specific values
            const config = await configRes.json();
            this.BOS_TOKEN_ID = config.decoder_start_token_id ?? 2;
            this.EOS_TOKEN_ID = config.eos_token_id ?? 3;
            console.debug(`[MANGA-DEBUG] Token IDs — BOS: ${this.BOS_TOKEN_ID}, EOS: ${this.EOS_TOKEN_ID}`);

            // Read normalization stats from preprocessor config
            const preproc = await preprocRes.json();
            this.imageMean = preproc.image_mean ?? [0.5, 0.5, 0.5];
            this.imageStd  = preproc.image_std  ?? [0.5, 0.5, 0.5];
            console.debug(`[MANGA-DEBUG] Normalization — mean: ${this.imageMean}, std: ${this.imageStd}`);
            
            this.isLoaded = true;
            console.debug("[MANGA-DEBUG] MangaOCR (Dual-Session) Ready.");
        } catch (err) {
            console.error("[MANGA-ERROR] Engine Load Failed:", err);
            this.isLoaded = false;
            throw err;
        }
    }

    /**
     * Performs Autoregressive Recognition (Encoder once -> Decoder Loop).
     */
    async recognize(imageData) {
        if (!this.isLoaded) throw new Error("MangaOCR not loaded.");

        try {
            // 1. Preprocessing (Engine-Local)
            const pixelValues = this._preprocessToTensor(imageData);

            // 2. Pass 1: Encoder (Image Features)
            const encoderOutput = await this.encoderSession.run({ pixel_values: pixelValues });
            const encoderHiddenStates = encoderOutput.last_hidden_state;

            // 3. Pass 2: Autoregressive Decoder Loop (Greedy Decoding)
            let inputIds = [this.BOS_TOKEN_ID];
            let resultTokens = [];

            for (let i = 0; i < this.MAX_LENGTH; i++) {
                // Prepare input ids tensor [1, current_length]
                const decoderFeeds = {
                    input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds.map(id => BigInt(id))), [1, inputIds.length]),
                    encoder_hidden_states: encoderHiddenStates
                };

                // Run Decoder
                const decoderOutput = await this.decoderSession.run(decoderFeeds);
                const logits = decoderOutput.logits; // [1, sequence_length, vocab_size]

                // Greedy Step: Take the Argmax of the LAST token's logits
                const nextTokenId = this._greedyChoice(logits);

                if (nextTokenId === this.EOS_TOKEN_ID) break;

                inputIds.push(nextTokenId);
                const token = this.vocab[nextTokenId] || "";
                // Filter BERT-style special tokens — generalizes to full [TOKEN] vocab class
                if (!(token.startsWith('[') && token.endsWith(']'))) {
                    resultTokens.push(token);
                }
            }

            // post_process: mirrors official manga-ocr post_process() function
            let text = resultTokens.join("");
            text = text.replace(/\u2026/g, '...');                       // … → ...
            text = text.replace(/[・.]{2,}/g, m => '.'.repeat(m.length)); // repeated dots normalize
            text = text.replace(/\s+/g, '');                              // strip whitespace
            return { text };
        } catch (err) {
            console.error("[MANGA-ERROR] Recognition Failed:", err);
            return { text: "" };
        }
    }

    /**
     * Internal greedy argmax on the final dimension of the logits tensor.
     */
    _greedyChoice(logits) {
        const [batch, seqLen, vocabSize] = logits.dims;
        const data = logits.data;
        const lastStepOffset = (seqLen - 1) * vocabSize;

        let maxIdx = 0;
        let maxVal = -Infinity;
        for (let j = 0; j < vocabSize; j++) {
            const val = data[lastStepOffset + j];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = j;
            }
        }
        return maxIdx;
    }

    /**
     * Isolated Preprocessing: Canvas -> 224x224 -> Greyscale -> Normalized Float32 Tensor.
     * Mirrors official manga-ocr: img.convert('L').convert('RGB') then ViTImageProcessor.
     * Direct stretch (no letterbox) — matches training-time preprocessing exactly.
     */
    _preprocessToTensor(sourceCanvas) {
        const d = this.RESIZE_DIM;
        const canvas = document.createElement('canvas');
        canvas.width = d; canvas.height = d;
        const ctx = canvas.getContext('2d');

        // Direct stretch to 224×224 — matches ViTImageProcessor default (no aspect ratio)
        ctx.drawImage(sourceCanvas, 0, 0, d, d);

        const pixels = ctx.getImageData(0, 0, d, d).data;
        const floatData = new Float32Array(d * d * 3);
        const mean = this.imageMean;
        const std  = this.imageStd;

        for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
            // BT.601 greyscale — mirrors PIL img.convert('L').convert('RGB')
            const grey = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
            const norm = (grey - mean[0]) / std[0]; // all channels identical after greyscale
            floatData[j]             = norm;
            floatData[j + d * d]     = norm;
            floatData[j + d * d * 2] = norm;
        }
        return new ort.Tensor('float32', floatData, [1, 3, d, d]);
    }

    /**
     * Releases both ONNX sessions.
     */
    async dispose() {
        try {
            if (this.encoderSession) {
                if (typeof this.encoderSession.release === 'function') await this.encoderSession.release();
                else if (this.encoderSession.handler) this.encoderSession.handler.dispose();
            }
            if (this.decoderSession) {
                if (typeof this.decoderSession.release === 'function') await this.decoderSession.release();
                else if (this.decoderSession.handler) this.decoderSession.handler.dispose();
            }
        } catch (e) {
            console.warn("[MANGA-DEBUG] Error during disposal", e);
        }
        this.encoderSession = null;
        this.decoderSession = null;
        this.isLoaded = false;
    }
}
