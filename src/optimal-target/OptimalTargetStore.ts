import { makeDartboard } from "../dartboard/dartboard-definition";
import { getDevice } from "../webgpu/util";
import optimalTargetReduceShader from "./optimal-target-reduce.wgsl?raw";
import optimalTargetShader from "./optimal-target.wgsl?raw";

export interface OptimalTargetResult {
  sigma: number;
  x: number;
  y: number;
}

export interface OptimalTargetState {
  results: OptimalTargetResult[];
  isComputing: boolean;
  currentSigma: number;
  isInitialized: boolean;
}

export interface SigmaRange {
  min: number;
  max: number;
  step: number;
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
      // Generate sigma values
      const sigmaValues: number[] = [];
      for (let sigma = sigmaRange.min; sigma <= sigmaRange.max; sigma += sigmaRange.step) {
        sigmaValues.push(sigma);
      }

      const results: OptimalTargetResult[] = [];

      // Compute optimal position for each sigma value
      for (const sigma of sigmaValues) {
        const position = await this.computeSingleOptimalTarget(sigma);
        results.push({
          sigma,
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

  private async computeSingleOptimalTarget(sigma: number): Promise<{ x: number; y: number }> {
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

    // Update uniform data with current sigma
    const uniformData = new Float32Array([
      this.canvasSize,
      this.canvasSize,
      sigma,
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
    sigma: number,
  ): OptimalTargetResult | null {
    // Find the closest sigma value in results
    let closestResult: OptimalTargetResult | null = null;
    let closestDistance = Infinity;

    for (const result of results) {
      const distance = Math.abs(result.sigma - sigma);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestResult = result;
      }
    }

    return closestResult;
  }

  renderToCanvas(
    canvas: HTMLCanvasElement,
    currentSigma: number,
    optimalPosition: { x: number; y: number } | null,
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw dartboard visualization using the dartboard data
    const dartboardScore = makeDartboard(this.canvasSize);
    const imageData = ctx.createImageData(canvas.width, canvas.height);

    // Calculate scale factor from computational resolution to display resolution
    const scaleX = canvas.width / this.canvasSize;
    const scaleY = canvas.height / this.canvasSize;

    // Create a scaled visualization of the dartboard scores
    for (let displayY = 0; displayY < canvas.height; displayY++) {
      for (let displayX = 0; displayX < canvas.width; displayX++) {
        // Map display coordinates back to computational coordinates
        const compX = Math.floor(displayX / scaleX);
        const compY = Math.floor(displayY / scaleY);
        
        // Ensure we don't go out of bounds
        const clampedX = Math.min(compX, this.canvasSize - 1);
        const clampedY = Math.min(compY, this.canvasSize - 1);
        
        const score = dartboardScore[clampedY * this.canvasSize + clampedX];
        const intensity = Math.min(score / 60, 1); // Normalize to 0-1, max score is typically 60
        
        // Color-code by score: black (0) to green (high scores)
        const r = Math.floor(intensity * 100);
        const g = Math.floor(intensity * 255);
        const b = Math.floor(intensity * 50);
        
        const index = (displayY * canvas.width + displayX) * 4;
        imageData.data[index + 0] = r;     // Red
        imageData.data[index + 1] = g;     // Green
        imageData.data[index + 2] = b;     // Blue
        imageData.data[index + 3] = 255;   // Alpha
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw optimal position as a red dot (scaled to display coordinates)
    if (optimalPosition) {
      const displayX = optimalPosition.x * scaleX;
      const displayY = optimalPosition.y * scaleY;
      
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
    ctx.fillText(`σ = ${currentSigma.toFixed(1)}`, 10, 20);
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
