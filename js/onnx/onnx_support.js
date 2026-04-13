export async function isWebGPUSupported() {
    const isIsolated = self.crossOriginIsolated;
    const ortInstance = typeof ort !== 'undefined' ? ort : null;
    
    // In some versions of ort-web, providers are on InferenceSession
    const sessionClass = ortInstance?.InferenceSession || ortInstance?.Session;
    const registrations = sessionClass?.getRegisteredProviders?.() || [];
    const hasWebGPU = registrations.includes('webgpu');
    
    console.log(`[ENGINE] Hardware Support — isolated: ${isIsolated}, registered: [${registrations.join(', ')}]`);

    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    
    // Return true if WebGPU is both registered in the library and supported by the hardware
    return hasWebGPU;
}
