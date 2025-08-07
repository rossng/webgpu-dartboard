import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initWebGPU, cleanupWebGPU } from '../test/webgpu-setup';
import hitDistributionShader from './hit-distribution.wgsl?raw';

class HitDistributionRunner {
  constructor(private device: GPUDevice) {}

  async computeDistribution(
    width: number,
    height: number,
    targetX: number,
    targetY: number
  ): Promise<Float32Array> {
    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: 'hit distribution shader',
      code: hitDistributionShader,
    });

    // Create compute pipeline
    const pipeline = this.device.createComputePipeline({
      label: 'hit distribution pipeline',
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'computeHitDistribution',
      },
    });

    // Create buffers
    const dataSize = width * height * 4; // Float32
    const dataBuffer = this.device.createBuffer({
      label: 'data buffer',
      size: dataSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const paramsBuffer = this.device.createBuffer({
      label: 'params buffer',
      size: 16, // 4 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Write parameters
    const params = new Float32Array([width, height, targetX, targetY]);
    this.device.queue.writeBuffer(paramsBuffer, 0, params);

    // Create result buffer for reading
    const resultBuffer = this.device.createBuffer({
      label: 'result buffer',
      size: dataSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      label: 'bind group',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: dataBuffer },
        },
        {
          binding: 1,
          resource: { buffer: paramsBuffer },
        },
      ],
    });

    // Execute compute shader
    const encoder = this.device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(width, height);
    computePass.end();

    // Copy result to readable buffer
    encoder.copyBufferToBuffer(dataBuffer, 0, resultBuffer, 0, dataSize);
    
    // Submit commands
    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);

    // Read results
    await resultBuffer.mapAsync(GPUMapMode.READ);
    const copyArrayBuffer = resultBuffer.getMappedRange();
    const results = new Float32Array(copyArrayBuffer.slice(0));
    resultBuffer.unmap();

    // Clean up
    dataBuffer.destroy();
    paramsBuffer.destroy();
    resultBuffer.destroy();

    return results;
  }
}

// Helper functions
function gaussian2D(
  x: number,
  y: number,
  muX: number,
  muY: number,
  sigmaX: number,
  sigmaY: number
): number {
  const coef = 1.0 / (2.0 * Math.PI * sigmaX * sigmaY);
  const expPart = Math.exp(
    -((x - muX) * (x - muX) / (2.0 * sigmaX * sigmaX) + 
      (y - muY) * (y - muY) / (2.0 * sigmaY * sigmaY))
  );
  return coef * expPart;
}

function findMaxIndex(arr: Float32Array): number {
  let maxIdx = 0;
  let maxVal = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > maxVal) {
      maxVal = arr[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

function convertTargetToPixel(
  target: number,
  dimension: number
): number {
  return (target + 1.0) * dimension * 0.5;
}

describe('Hit Distribution WebGPU Real Execution', () => {
  let device: GPUDevice;
  let runner: HitDistributionRunner;

  beforeAll(async () => {
    const gpu = await initWebGPU();
    device = gpu.device;
    runner = new HitDistributionRunner(device);
  });

  afterAll(async () => {
    await cleanupWebGPU();
  });

  it('should execute hit distribution shader on actual WebGPU', async () => {
    const width = 100;
    const height = 100;
    const targetX = 0.0;
    const targetY = 0.0;

    const results = await runner.computeDistribution(width, height, targetX, targetY);

    // Verify results
    expect(results.length).toBe(width * height);
    
    // Check center value (should be highest for target at 0,0)
    const targetPixelX = convertTargetToPixel(targetX, width);
    const targetPixelY = convertTargetToPixel(targetY, height);
    const centerIdx = Math.floor(targetPixelY) * width + Math.floor(targetPixelX);
    const centerValue = results[centerIdx];
    
    // Expected value from gaussian formula
    const expectedCenter = 1.0 / (2.0 * Math.PI * 100 * 100);
    expect(centerValue).toBeCloseTo(expectedCenter, 5);
    
    // Check that values decrease away from center
    const cornerValue = results[0];
    expect(cornerValue).toBeLessThan(centerValue);
    
    // Check that we have non-zero values
    const nonZeroCount = results.filter(v => v > 0).length;
    expect(nonZeroCount).toBeGreaterThan(0);
  });

  it('should compute different distributions for different targets', async () => {
    const width = 50;
    const height = 50;

    // Test different target positions
    const centerDist = await runner.computeDistribution(width, height, 0, 0);
    const topRightDist = await runner.computeDistribution(width, height, 0.5, 0.5);
    const bottomLeftDist = await runner.computeDistribution(width, height, -0.5, -0.5);

    // Verify each distribution has different peak locations
    const centerMaxIdx = findMaxIndex(centerDist);
    const topRightMaxIdx = findMaxIndex(topRightDist);
    const bottomLeftMaxIdx = findMaxIndex(bottomLeftDist);

    // The max indices should be different for different targets
    expect(centerMaxIdx).not.toBe(topRightMaxIdx);
    expect(centerMaxIdx).not.toBe(bottomLeftMaxIdx);
    expect(topRightMaxIdx).not.toBe(bottomLeftMaxIdx);

    // Verify the max is roughly where we expect
    const centerExpectedIdx = Math.floor(height / 2) * width + Math.floor(width / 2);
    expect(Math.abs(centerMaxIdx - centerExpectedIdx)).toBeLessThanOrEqual(width + 1);
  });

  it('should validate gaussian computation matches expected formula', async () => {
    const width = 10;
    const height = 10;
    const targetX = 0.0;
    const targetY = 0.0;

    const results = await runner.computeDistribution(width, height, targetX, targetY);

    const targetPixelX = convertTargetToPixel(targetX, width);
    const targetPixelY = convertTargetToPixel(targetY, height);

    // Check a few specific points
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const idx = y * width + x;
      
      const shaderValue = results[idx];
      const expectedValue = gaussian2D(x, y, targetPixelX, targetPixelY, 100, 100);
      
      // Allow some tolerance due to floating point differences
      expect(shaderValue).toBeCloseTo(expectedValue, 4);
    }
  });
});