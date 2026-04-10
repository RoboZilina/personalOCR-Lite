export class TransformersEngine {
    constructor() {
        this.id = "transformers";
        this.label = "Transformers.js OCR";
        this.isLoaded = false;
    }

    async load() {
        // Placeholder for future ONNX / WebGPU / WebNN loading
        this.isLoaded = true;
    }

    async recognize(cropCanvas) {
        // Placeholder: return empty result for now
        return { text: "" };
    }

    async dispose() {
        // Placeholder: release any future resources
        this.isLoaded = false;
    }
}
