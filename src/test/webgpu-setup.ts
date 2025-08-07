let adapter: GPUAdapter | null = null;
let device: GPUDevice | null = null;

export async function initWebGPU(): Promise<{ adapter: GPUAdapter; device: GPUDevice }> {
  if (!adapter || !device) {
    const webgpu = await import('webgpu');
    
    // Initialize WebGPU
    const gpu = webgpu.create([]);
    
    // Set up navigator.gpu for tests
    if (typeof navigator === 'undefined') {
      (global as any).navigator = {};
    }
    (navigator as any).gpu = gpu;
    
    // Also set up global WebGPU types
    for (const [key, value] of Object.entries(webgpu.globals)) {
      (global as any)[key] = value;
    }
    
    adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }
    
    device = await adapter.requestDevice();
    if (!device) {
      throw new Error('Failed to get WebGPU device');
    }
  }
  
  return { adapter, device };
}

export async function cleanupWebGPU() {
  if (device) {
    device.destroy();
    device = null;
  }
  adapter = null;
}