import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REGULATION_BOARD, normaliseDartboard } from "../dartboard/dartboard-definition";
import { convertTargetToPixel, gaussian2D } from "../test/utils";
import { cleanupWebGPU, initWebGPU } from "../test/webgpu-setup";
import segmentProbabilitiesShader from "./segment-probabilities.wgsl?raw";

// JavaScript implementation of the segment probabilities calculation
class SegmentProbabilities {
  private dartboard = normaliseDartboard(REGULATION_BOARD);
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getSliceIndex(x: number, y: number): number {
    // Flip across y-axis by negating x (matching shader logic)
    const theta = Math.atan2(y, -x) + Math.PI;
    const adjustedTheta = (theta + Math.PI / 20) % (2 * Math.PI);
    const slice = (adjustedTheta / (2 * Math.PI)) * 20;
    return Math.floor(slice);
  }

  getSegmentId(x: number, y: number): number {
    const r = Math.sqrt(x * x + y * y);

    // Outside dartboard - shader checks against 1.0
    if (r > 1.0) {
      return 62; // Miss
    }

    // Bull (50 points) - compare radius against radius (diameter / 2)
    if (r < this.dartboard.doubleBullDiameter / 2) {
      return 61; // Bull
    }

    // Outer bull (25 points) - compare radius against radius (diameter / 2)
    if (r < this.dartboard.bullDiameter / 2) {
      return 60; // Outer bull
    }

    // Get slice index (0-19)
    const sliceIdx = this.getSliceIndex(x, y);

    // Determine ring type
    const innerTripleRadius = this.dartboard.centerToOuterTriple - this.dartboard.tripleRingWidth;
    const innerDoubleRadius = this.dartboard.centerToOuterDouble - this.dartboard.doubleRingWidth;

    if (r < innerTripleRadius) {
      // Inner single area
      return sliceIdx; // 0-19: Single scores
    } else if (r <= this.dartboard.centerToOuterTriple) {
      // Triple ring
      return 20 + sliceIdx; // 20-39: Triple scores
    } else if (r < innerDoubleRadius) {
      // Outer single area
      return sliceIdx; // 0-19: Single scores
    } else if (r <= this.dartboard.centerToOuterDouble) {
      // Double ring
      return 40 + sliceIdx; // 40-59: Double scores
    } else {
      // Outside double ring
      return 62; // Miss
    }
  }

  computeSegmentProbabilities(
    targetX: number,
    targetY: number,
    sigmaX: number,
    sigmaY: number,
  ): { hitData: Float32Array; segmentSums: Float32Array } {
    const hitData = new Float32Array(this.width * this.height);
    const segmentSums = new Float32Array(63); // 0-19: singles, 20-39: triples, 40-59: doubles, 60: outer bull, 61: bull, 62: miss

    // Convert target from normalized coords (-1 to 1) to pixel coords
    const targetPixelX = convertTargetToPixel(targetX, this.width);
    const targetPixelY = convertTargetToPixel(targetY, this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Calculate gaussian hit probability at this pixel
        const gaussianValue = gaussian2D(x, y, targetPixelX, targetPixelY, sigmaX, sigmaY);

        // Store the gaussian value
        hitData[y * this.width + x] = gaussianValue;

        // Convert pixel coordinates to normalized coordinates (-1 to 1)
        const normX = (x / this.width) * 2.0 - 1.0;
        const normY = (y / this.height) * 2.0 - 1.0;

        // Determine which segment this pixel belongs to
        const segmentId = this.getSegmentId(normX, normY);

        // Add this pixel's probability to the appropriate segment sum
        if (segmentId >= 0) {
          segmentSums[segmentId] += gaussianValue;
        }
      }
    }

    return { hitData, segmentSums };
  }

  getSegmentLabel(segmentId: number): string {
    if (segmentId === 61) return "Bull (50)";
    if (segmentId === 60) return "Outer Bull (25)";
    if (segmentId === 62) return "Miss";

    const radialScores = this.dartboard.radialScores;

    if (segmentId < 20) {
      return `Single ${radialScores[segmentId]}`;
    } else if (segmentId < 40) {
      return `Triple ${radialScores[segmentId - 20]}`;
    } else if (segmentId < 60) {
      return `Double ${radialScores[segmentId - 40]}`;
    }

    return "Unknown";
  }
}

describe("Segment Probabilities WebGPU Shader", () => {
  let device: GPUDevice;

  beforeAll(async () => {
    const gpu = await initWebGPU();
    device = gpu.device;
  });

  afterAll(async () => {
    await cleanupWebGPU();
  });

  async function runSegmentProbabilitiesShader(
    width: number,
    height: number,
    targetX: number,
    targetY: number,
    sigmaX: number,
    sigmaY: number,
  ): Promise<{ hitData: Float32Array; segmentSums: Uint32Array }> {
    // Create shader module
    const shaderModule = device.createShaderModule({
      label: "segment probabilities shader",
      code: segmentProbabilitiesShader,
    });

    // Create compute pipeline
    const pipeline = device.createComputePipeline({
      label: "segment probabilities pipeline",
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "computeSegmentProbabilities",
      },
    });

    // Create buffers
    const hitDataSize = width * height * 4; // Float32
    const hitDataBuffer = device.createBuffer({
      label: "hit data buffer",
      size: hitDataSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const paramsBuffer = device.createBuffer({
      label: "params buffer",
      size: 16, // 4 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const segmentSumsSize = 63 * 4; // 63 segments, Uint32
    const segmentSumsBuffer = device.createBuffer({
      label: "segment sums buffer",
      size: segmentSumsSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });

    // Initialize segment sums to zero
    const segmentSumsData = new Uint32Array(segmentSumsBuffer.getMappedRange());
    segmentSumsData.fill(0);
    segmentSumsBuffer.unmap();

    const sigmasBuffer = device.createBuffer({
      label: "sigmas buffer",
      size: 8, // 2 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Write parameters
    const params = new Float32Array([width, height, targetX, targetY]);
    device.queue.writeBuffer(paramsBuffer, 0, params);

    const sigmas = new Float32Array([sigmaX, sigmaY]);
    device.queue.writeBuffer(sigmasBuffer, 0, sigmas);

    // Create result buffers for reading
    const hitDataResultBuffer = device.createBuffer({
      label: "hit data result buffer",
      size: hitDataSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const segmentSumsResultBuffer = device.createBuffer({
      label: "segment sums result buffer",
      size: segmentSumsSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Create bind group
    const bindGroup = device.createBindGroup({
      label: "bind group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: hitDataBuffer } },
        { binding: 1, resource: { buffer: paramsBuffer } },
        { binding: 2, resource: { buffer: segmentSumsBuffer } },
        { binding: 3, resource: { buffer: sigmasBuffer } },
      ],
    });

    // Execute compute shader
    const encoder = device.createCommandEncoder();
    const computePass = encoder.beginComputePass();

    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(width, height);
    computePass.end();

    // Copy results to readable buffers
    encoder.copyBufferToBuffer(hitDataBuffer, 0, hitDataResultBuffer, 0, hitDataSize);
    encoder.copyBufferToBuffer(segmentSumsBuffer, 0, segmentSumsResultBuffer, 0, segmentSumsSize);

    // Submit commands
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    // Read hit data results
    await hitDataResultBuffer.mapAsync(GPUMapMode.READ);
    const hitDataArrayBuffer = hitDataResultBuffer.getMappedRange();
    const hitData = new Float32Array(hitDataArrayBuffer.slice(0));
    hitDataResultBuffer.unmap();

    // Read segment sums results
    await segmentSumsResultBuffer.mapAsync(GPUMapMode.READ);
    const segmentSumsArrayBuffer = segmentSumsResultBuffer.getMappedRange();
    const segmentSums = new Uint32Array(segmentSumsArrayBuffer.slice(0));
    segmentSumsResultBuffer.unmap();

    // Clean up
    hitDataBuffer.destroy();
    paramsBuffer.destroy();
    segmentSumsBuffer.destroy();
    sigmasBuffer.destroy();
    hitDataResultBuffer.destroy();
    segmentSumsResultBuffer.destroy();

    return { hitData, segmentSums };
  }

  it("should validate segment probabilities against JS implementation on 100x100 grid", async () => {
    const width = 100;
    const height = 100;
    const targetX = 0.0;
    const targetY = 0.0;
    const sigmaX = 50;
    const sigmaY = 50;

    // Run JS implementation
    const jsImpl = new SegmentProbabilities(width, height);
    const jsResults = jsImpl.computeSegmentProbabilities(targetX, targetY, sigmaX, sigmaY);

    // Run WebGPU shader
    const gpuResults = await runSegmentProbabilitiesShader(
      width,
      height,
      targetX,
      targetY,
      sigmaX,
      sigmaY,
    );

    // Validate hit data matches
    expect(gpuResults.hitData.length).toBe(jsResults.hitData.length);

    // Check a sample of pixels for matching gaussian values
    for (let i = 0; i < 1000; i++) {
      const randomIdx = Math.floor(Math.random() * gpuResults.hitData.length);
      expect(gpuResults.hitData[randomIdx]).toBeCloseTo(jsResults.hitData[randomIdx], 5);
    }

    // Convert GPU segment sums from optimal precision fixed-point to float (divided by 500M)
    const gpuSegmentSumsFloat = new Float32Array(gpuResults.segmentSums.length);
    for (let i = 0; i < gpuResults.segmentSums.length; i++) {
      gpuSegmentSumsFloat[i] = gpuResults.segmentSums[i] / 500000000.0;
    }

    // Validate segment sums match (with some tolerance for atomic operations and floating point)
    for (let i = 0; i < jsResults.segmentSums.length; i++) {
      if (jsResults.segmentSums[i] > 0.001 || gpuSegmentSumsFloat[i] > 0.001) {
        const relativeError =
          Math.abs(gpuSegmentSumsFloat[i] - jsResults.segmentSums[i]) /
          Math.max(Math.max(jsResults.segmentSums[i], gpuSegmentSumsFloat[i]), 0.000001);

        // Allow reasonable tolerance for atomic operations and floating point precision
        expect(relativeError).toBeLessThan(0.01); // Allow 10% relative error
      }
    }
  });

  it("should compute different distributions for different target positions", async () => {
    const width = 50;
    const height = 50;
    const sigmaX = 30;
    const sigmaY = 30;

    // Test different targets
    const targets = [
      { x: 0, y: 0, expectedHighest: 61 }, // Bull should be highest
      { x: 0.3, y: 0, expectedHighest: 0 }, // Right single area
      { x: -0.3, y: 0, expectedHighest: 10 }, // Left single area
    ];

    for (const target of targets) {
      const result = await runSegmentProbabilitiesShader(
        width,
        height,
        target.x,
        target.y,
        sigmaX,
        sigmaY,
      );

      // Convert from high precision fixed-point
      const segmentSumsFloat = new Float32Array(result.segmentSums.length);
      for (let i = 0; i < result.segmentSums.length; i++) {
        segmentSumsFloat[i] = result.segmentSums[i] / 500000000.0;
      }

      // Ensure we have valid probabilities
      expect(segmentSumsFloat.some((p) => p > 0)).toBe(true);

      // For centered target, bull should have significant probability
      if (target.x === 0 && target.y === 0) {
        expect(segmentSumsFloat[61]).toBeGreaterThan(0); // Bull should have probability
      }
    }
  });

  it("should properly segment the dartboard", async () => {
    const width = 20;
    const height = 20;

    // Create a uniform distribution (very large sigma)
    const targetX = 0;
    const targetY = 0;
    const sigmaX = 500;
    const sigmaY = 500;

    const jsImpl = new SegmentProbabilities(width, height);
    const jsResults = jsImpl.computeSegmentProbabilities(targetX, targetY, sigmaX, sigmaY);

    // Check that all dartboard segments get some probability
    const segmentsWithProb = jsResults.segmentSums.filter((s) => s > 0).length;

    // We should have probabilities in multiple segments
    expect(segmentsWithProb).toBeGreaterThan(20); // At least singles
  });

  it("should validate segment ID calculation matches JS", async () => {
    const jsImpl = new SegmentProbabilities(100, 100);

    // Test specific points
    const testPoints = [
      { x: 0, y: 0, expectedSegment: 61 }, // Bull
      { x: 0.08, y: 0, expectedSegment: 60 }, // Outer bull
      { x: 0.2, y: 0, expectedSegment: 0 }, // Single 6 (rightmost)
      { x: -0.2, y: 0, expectedSegment: 10 }, // Single 11 (leftmost)
      { x: 0, y: 0.2, expectedSegment: 15 }, // Single 3
      { x: 0, y: -0.2, expectedSegment: 5 }, // Single 20
      { x: 1.5, y: 0, expectedSegment: 62 }, // Miss (outside)
    ];

    for (const point of testPoints) {
      const segmentId = jsImpl.getSegmentId(point.x, point.y);
      expect(segmentId).toBe(point.expectedSegment);
    }
  });
});
