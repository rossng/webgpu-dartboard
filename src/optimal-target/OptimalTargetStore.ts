import { getDartboardColor } from "../dartboard/dartboard-colors";
import { makeDartboard, mmToPixels } from "../dartboard/dartboard-definition";
import { drawRadialScores } from "../dartboard/dartboard-labels";
import { getDevice } from "../webgpu/util";
import { getViridisColor } from "../webgpu/viridis";
import optimalTargetReduceShader from "./optimal-target-reduce.wgsl?raw";
import optimalTargetShader from "./optimal-target.wgsl?raw";

export interface OptimalTargetResult {
  sigma: number; // Sigma in mm
  x: number; // X position in computational canvas pixels
  y: number; // Y position in computational canvas pixels
}

export interface OptimalTargetState {
  results: OptimalTargetResult[];
  isComputing: boolean;
  currentSigma: number; // Current sigma in mm
  isInitialized: boolean;
}

export interface SigmaRange {
  min: number; // Minimum sigma in mm
  max: number; // Maximum sigma in mm
  step: number; // Step size in mm
}

/**
 * OptimalTargetStore handles WebGPU computations for finding optimal dartboard target positions.
 * Each instance is parameterized by canvas size, allowing different resolution computations.
 */
export class OptimalTargetStore {
  private device: GPUDevice | null = null;
  private findOptimalPositionPipeline: GPUComputePipeline | null = null;
  private findGlobalOptimumPipeline: GPUComputePipeline | null = null;
  private dartboardBuffer: GPUBuffer | null = null;
  private workgroupResultsBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private resultBuffer: GPUBuffer | null = null;
  private currentComputation: Promise<void> | null = null;
  private readonly numWorkgroups = 16; // Number of workgroups to use

  /**
   * Creates a new OptimalTargetStore instance.
   * @param canvasSize - The size (width and height) of the dartboard canvas in pixels.
   *                     Higher values provide more accurate results but require more computation.
   */
  constructor(private readonly canvasSize: number) {}

  /**
   * Gets the canvas size this store was configured with.
   */
  getCanvasSize(): number {
    return this.canvasSize;
  }

  async initialize(): Promise<void> {
    const device = await getDevice();
    if (!device) {
      throw new Error("Cannot initialize without WebGPU device");
    }
    this.device = device;

    // Create shader modules and pipelines
    const module1 = this.device.createShaderModule({
      label: "optimal target module",
      code: optimalTargetShader,
    });

    const module2 = this.device.createShaderModule({
      label: "optimal target reduce module",
      code: optimalTargetReduceShader,
    });

    this.findOptimalPositionPipeline = this.device.createComputePipeline({
      label: "find optimal position pipeline",
      layout: "auto",
      compute: {
        module: module1,
        entryPoint: "findOptimalPosition",
      },
    });

    this.findGlobalOptimumPipeline = this.device.createComputePipeline({
      label: "find global optimum pipeline",
      layout: "auto",
      compute: {
        module: module2,
        entryPoint: "findGlobalOptimum",
      },
    });

    // Create persistent buffers
    this.workgroupResultsBuffer = this.device.createBuffer({
      label: "workgroup results buffer",
      size: this.numWorkgroups * 12, // vec3f = 3 * f32 = 12 bytes per workgroup
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.resultBuffer = this.device.createBuffer({
      label: "result buffer",
      size: 12, // vec3f = 3 * f32 = 12 bytes for final result
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Create dartboard data
    const dartboardScore = makeDartboard(this.canvasSize);
    this.dartboardBuffer = this.device.createBuffer({
      label: "dartboard buffer",
      size: dartboardScore.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.dartboardBuffer, 0, dartboardScore.buffer);

    // Create uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: 16, // vec4f = 4 * f32 = 16 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  async computeAllOptimalTargets(
    sigmaRange: SigmaRange,
    onStateUpdate: (state: Partial<OptimalTargetState>) => void,
  ): Promise<void> {
    // Prevent multiple simultaneous computations
    if (this.currentComputation) {
      return;
    }

    if (!this.device) {
      await this.initialize();
      if (!this.device) return;
    }

    onStateUpdate({ isComputing: true, results: [] });

    const computationPromise = this.executeAllComputations(sigmaRange, onStateUpdate);
    this.currentComputation = computationPromise;

    try {
      await computationPromise;
    } finally {
      this.currentComputation = null;
      onStateUpdate({ isComputing: false, isInitialized: true });
    }
  }

  private async executeAllComputations(
    sigmaRange: SigmaRange,
    onStateUpdate: (state: Partial<OptimalTargetState>) => void,
  ): Promise<void> {
    if (
      !this.device ||
      !this.findOptimalPositionPipeline ||
      !this.findGlobalOptimumPipeline ||
      !this.dartboardBuffer ||
      !this.uniformBuffer ||
      !this.workgroupResultsBuffer ||
      !this.resultBuffer
    )
      return;

    try {
      // Generate sigma values in mm
      const sigmaValues: number[] = [];
      for (let sigma = sigmaRange.min; sigma <= sigmaRange.max; sigma += sigmaRange.step) {
        sigmaValues.push(sigma);
      }

      const results: OptimalTargetResult[] = [];

      // Compute optimal position for each sigma value (sigma is in mm)
      for (const sigmaMm of sigmaValues) {
        const position = await this.computeSingleOptimalTarget(sigmaMm);
        results.push({
          sigma: sigmaMm, // Store sigma in mm
          x: position.x,
          y: position.y,
        });

        // Update progress
        onStateUpdate({ results: [...results] });
      }

      onStateUpdate({ results });
    } catch (error) {
      console.error("Error computing optimal targets:", error);
      throw error;
    }
  }

  private async computeSingleOptimalTarget(sigmaMm: number): Promise<{ x: number; y: number }> {
    if (
      !this.device ||
      !this.findOptimalPositionPipeline ||
      !this.findGlobalOptimumPipeline ||
      !this.dartboardBuffer ||
      !this.uniformBuffer ||
      !this.workgroupResultsBuffer ||
      !this.resultBuffer
    ) {
      throw new Error("Store not initialized");
    }

    // Convert sigma from mm to pixels for the computational canvas
    const sigmaPixels = mmToPixels(sigmaMm, this.canvasSize);

    // Update uniform data with current sigma in pixels
    const uniformData = new Float32Array([
      this.canvasSize,
      this.canvasSize,
      sigmaPixels,
      this.numWorkgroups,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    // Create bind group for first stage
    const bindGroup1 = this.device.createBindGroup({
      label: "optimal target bind group stage 1",
      layout: this.findOptimalPositionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.workgroupResultsBuffer } },
        { binding: 1, resource: { buffer: this.dartboardBuffer } },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    // Create bind group for second stage (only needs workgroup results and uniform)
    const bindGroup2 = this.device.createBindGroup({
      label: "optimal target bind group stage 2",
      layout: this.findGlobalOptimumPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.workgroupResultsBuffer } },
        { binding: 1, resource: { buffer: this.uniformBuffer } },
      ],
    });

    // Execute computation
    const encoder = this.device.createCommandEncoder({
      label: "optimal target encoder",
    });

    // First stage: find optimal positions within each workgroup
    const pass1 = encoder.beginComputePass({
      label: "optimal target compute pass stage 1",
    });
    pass1.setPipeline(this.findOptimalPositionPipeline);
    pass1.setBindGroup(0, bindGroup1);
    pass1.dispatchWorkgroups(this.numWorkgroups);
    pass1.end();

    // Second stage: find global optimum across workgroups
    const pass2 = encoder.beginComputePass({
      label: "optimal target compute pass stage 2",
    });
    pass2.setPipeline(this.findGlobalOptimumPipeline);
    pass2.setBindGroup(0, bindGroup2);
    pass2.dispatchWorkgroups(1);
    pass2.end();

    // Copy final result
    encoder.copyBufferToBuffer(this.workgroupResultsBuffer, 0, this.resultBuffer, 0, 12);

    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);

    // Read result
    await this.resultBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(this.resultBuffer.getMappedRange().slice(0));
    this.resultBuffer.unmap();

    return {
      x: resultData[0],
      y: resultData[1],
    };
  }

  getOptimalTargetForSigma(
    results: OptimalTargetResult[],
    sigmaMm: number,
  ): OptimalTargetResult | null {
    // Find the closest sigma value in results (both are in mm)
    let closestResult: OptimalTargetResult | null = null;
    let closestDistance = Infinity;

    for (const result of results) {
      const distance = Math.abs(result.sigma - sigmaMm);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestResult = result;
      }
    }

    return closestResult;
  }

  renderToCanvas(
    canvas: HTMLCanvasElement,
    currentSigmaMm: number,
    optimalPosition: { x: number; y: number } | null,
    showDartboardColors: boolean = true,
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imageData = ctx.createImageData(canvas.width, canvas.height);

    // Calculate scale factor from computational resolution to display resolution
    const scaleX = canvas.width / this.canvasSize;
    const scaleY = canvas.height / this.canvasSize;

    if (showDartboardColors) {
      // Render dartboard colors at display resolution
      for (let displayY = 0; displayY < canvas.height; displayY++) {
        for (let displayX = 0; displayX < canvas.width; displayX++) {
          // Map display coordinates to normalized coordinates (-1 to 1)
          const normX = (displayX / canvas.width) * 2 - 1;
          const normY = (displayY / canvas.height) * 2 - 1;

          // Get dartboard color at this position
          const color = getDartboardColor(normX, normY);

          const index = (displayY * canvas.width + displayX) * 4;

          // Use full dartboard colors without intensity scaling
          imageData.data[index + 0] = color.r;
          imageData.data[index + 1] = color.g;
          imageData.data[index + 2] = color.b;
          imageData.data[index + 3] = 255;
        }
      }
    } else {
      // Generate dartboard scores at display resolution for viridis rendering
      const displayDartboardScore = makeDartboard(canvas.width);
      const maxScore = displayDartboardScore.reduce((max, score) => Math.max(max, score), 0);

      for (let displayY = 0; displayY < canvas.height; displayY++) {
        for (let displayX = 0; displayX < canvas.width; displayX++) {
          const score = displayDartboardScore[displayY * canvas.width + displayX];
          const intensity = maxScore > 0 ? score / maxScore : 0;
          const color = getViridisColor(intensity);

          const index = (displayY * canvas.width + displayX) * 4;

          imageData.data[index + 0] = color.r;
          imageData.data[index + 1] = color.g;
          imageData.data[index + 2] = color.b;
          imageData.data[index + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw radial scores when using dartboard colors
    if (showDartboardColors) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const labelRadius = canvas.width * 0.45; // Place labels outside the dartboard
      drawRadialScores(ctx, centerX, centerY, labelRadius, 14, "#fff");
    }

    // Draw optimal position as a red dot (scaled to display coordinates)
    if (optimalPosition) {
      const displayX = optimalPosition.x * scaleX;
      const displayY = optimalPosition.y * scaleY;

      // Draw Gaussian standard deviation ring
      const sigmaPixelsComp = mmToPixels(currentSigmaMm, this.canvasSize);
      const sigmaPixelsDisplay = sigmaPixelsComp * scaleX;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(displayX, displayY, sigmaPixelsDisplay, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw optimal position dot
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.arc(displayX, displayY, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Add white border for better visibility
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Add current sigma value as text
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText(`σ = ${currentSigmaMm.toFixed(1)} mm`, 10, 20);
    ctx.fillText(`Resolution: ${this.canvasSize}x${this.canvasSize}`, 10, 40);

    if (optimalPosition) {
      ctx.fillText(
        `Optimal: (${optimalPosition.x.toFixed(1)}, ${optimalPosition.y.toFixed(1)})`,
        10,
        60,
      );
    }
  }
}
