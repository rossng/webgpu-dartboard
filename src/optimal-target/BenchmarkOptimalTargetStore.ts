import { getDartboardColor } from "../dartboard/dartboard-colors";
import { makeDartboard, mmToPixels } from "../dartboard/dartboard-definition";
import { drawRadialScores } from "../dartboard/dartboard-labels";
import { getDevice } from "../webgpu/util";
import { getViridisColor } from "../webgpu/viridis";
import { OptimalTargetResult, OptimalTargetState, SigmaRange } from "./OptimalTargetStore";
import optimalTargetReduceShader from "./optimal-target-reduce.wgsl?raw";

/**
 * Enhanced OptimalTargetStore for benchmarking with configurable workgroup parameters.
 * Allows testing different workgroup sizes and number of workgroups for optimization.
 */
export class BenchmarkOptimalTargetStore {
  private device: GPUDevice | null = null;
  private findOptimalPositionPipeline: GPUComputePipeline | null = null;
  private findGlobalOptimumPipeline: GPUComputePipeline | null = null;
  private dartboardBuffer: GPUBuffer | null = null;
  private workgroupResultsBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private resultBuffer: GPUBuffer | null = null;
  private currentComputation: Promise<void> | null = null;

  /**
   * Creates a new BenchmarkOptimalTargetStore instance.
   * @param canvasSize - The size (width and height) of the dartboard canvas in pixels.
   * @param workgroupSize - The size of each workgroup (must be a power of 2, typically 16, 32, 64, 128, or 256).
   * @param numWorkgroups - The number of workgroups to dispatch.
   */
  constructor(
    private readonly canvasSize: number,
    private readonly workgroupSize: number = 64,
    private readonly numWorkgroups: number = 16
  ) {}

  /**
   * Gets the canvas size this store was configured with.
   */
  getCanvasSize(): number {
    return this.canvasSize;
  }

  /**
   * Gets the workgroup size this store was configured with.
   */
  getWorkgroupSize(): number {
    return this.workgroupSize;
  }

  /**
   * Gets the number of workgroups this store was configured with.
   */
  getNumWorkgroups(): number {
    return this.numWorkgroups;
  }

  async initialize(): Promise<void> {
    const device = await getDevice();
    if (!device) {
      throw new Error("Cannot initialize without WebGPU device");
    }
    this.device = device;

    // Create custom shader with configurable workgroup size
    const customOptimalTargetShader = this.createCustomOptimalTargetShader();

    // Create shader modules and pipelines
    const module1 = this.device.createShaderModule({
      label: "benchmark optimal target module",
      code: customOptimalTargetShader,
    });

    const module2 = this.device.createShaderModule({
      label: "benchmark optimal target reduce module",
      code: optimalTargetReduceShader,
    });

    this.findOptimalPositionPipeline = this.device.createComputePipeline({
      label: "benchmark find optimal position pipeline",
      layout: "auto",
      compute: {
        module: module1,
        entryPoint: "findOptimalPosition",
      },
    });

    this.findGlobalOptimumPipeline = this.device.createComputePipeline({
      label: "benchmark find global optimum pipeline",
      layout: "auto",
      compute: {
        module: module2,
        entryPoint: "findGlobalOptimum",
      },
    });

    // Create persistent buffers
    this.workgroupResultsBuffer = this.device.createBuffer({
      label: "benchmark workgroup results buffer",
      size: this.numWorkgroups * 12, // vec3f = 3 * f32 = 12 bytes per workgroup
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.resultBuffer = this.device.createBuffer({
      label: "benchmark result buffer",
      size: 12, // vec3f = 3 * f32 = 12 bytes for final result
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Create dartboard data
    const dartboardScore = makeDartboard(this.canvasSize);
    this.dartboardBuffer = this.device.createBuffer({
      label: "benchmark dartboard buffer",
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

  private createCustomOptimalTargetShader(): string {
    // Generate shader with custom workgroup size
    return `@group(0) @binding(0) var<storage, read_write> workgroup_results: array<vec3f>; // x, y, score for each workgroup
@group(0) @binding(1) var<storage, read> dartboard: array<u32>;
@group(0) @binding(2) var<uniform> params: vec4f; // x: width, y: height, z: sigma, w: num_workgroups

const WORKGROUP_SIZE: u32 = ${this.workgroupSize};
var<workgroup> shared_scores: array<f32, WORKGROUP_SIZE>;
var<workgroup> shared_positions: array<vec2f, WORKGROUP_SIZE>;

@compute @workgroup_size(${this.workgroupSize}) fn findOptimalPosition(
  @builtin(workgroup_id) workgroup_id: vec3<u32>,
  @builtin(local_invocation_index) local_index: u32,
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
  let width = u32(params.x);
  let height = u32(params.y);
  let sigma = params.z;
  let total_positions = width * height;
  
  // Calculate how many positions this workgroup should handle
  let total_workgroups = num_workgroups.x * num_workgroups.y * num_workgroups.z;
  let positions_per_workgroup = (total_positions + total_workgroups - 1) / total_workgroups;
  let workgroup_index = workgroup_id.x + workgroup_id.y * num_workgroups.x + workgroup_id.z * num_workgroups.x * num_workgroups.y;
  let workgroup_start = workgroup_index * positions_per_workgroup;
  let workgroup_end = min(workgroup_start + positions_per_workgroup, total_positions);
  
  // Each thread in the workgroup handles a subset of positions
  let positions_per_thread = (positions_per_workgroup + WORKGROUP_SIZE - 1) / WORKGROUP_SIZE;
  let thread_start = workgroup_start + local_index * positions_per_thread;
  let thread_end = min(thread_start + positions_per_thread, workgroup_end);
  
  var max_expected_score: f32 = 0.0;
  var optimal_x: f32 = 0.0;
  var optimal_y: f32 = 0.0;
  
  // Each thread searches its assigned positions
  for (var pos: u32 = thread_start; pos < thread_end; pos = pos + 1) {
    let x = pos % width;
    let y = pos / width;
    let expected_score = computeExpectedScoreAtPosition(f32(x), f32(y), sigma, width, height);
    
    if (expected_score > max_expected_score) {
      max_expected_score = expected_score;
      optimal_x = f32(x);
      optimal_y = f32(y);
    }
  }
  
  // Store this thread's best result in shared memory
  shared_scores[local_index] = max_expected_score;
  shared_positions[local_index] = vec2f(optimal_x, optimal_y);
  
  // Synchronize workgroup threads
  workgroupBarrier();
  
  // Perform parallel reduction to find the best result across the workgroup
  // Only thread 0 performs the reduction
  if (local_index == 0) {
    var workgroup_max_score = shared_scores[0];
    var workgroup_optimal_position = shared_positions[0];
    
    for (var i: u32 = 1; i < WORKGROUP_SIZE; i = i + 1) {
      if (shared_scores[i] > workgroup_max_score) {
        workgroup_max_score = shared_scores[i];
        workgroup_optimal_position = shared_positions[i];
      }
    }
    
    // Store this workgroup's result for later reduction
    workgroup_results[workgroup_index] = vec3f(workgroup_optimal_position.x, workgroup_optimal_position.y, workgroup_max_score);
  }
}


fn computeExpectedScoreAtPosition(target_x: f32, target_y: f32, sigma: f32, width: u32, height: u32) -> f32 {
  var total_probability: f32 = 0.0;
  var total_score: f32 = 0.0;
  
  // Sample the Gaussian distribution around the target position
  for (var y: u32 = 0; y < height; y = y + 1) {
    for (var x: u32 = 0; x < width; x = x + 1) {
      let gaussian = gaussian2D(f32(x), f32(y), target_x, target_y, sigma, sigma);
      let score = f32(dartboard[y * width + x]);
      
      total_probability = total_probability + gaussian;
      total_score = total_score + gaussian * score;
    }
  }
  
  return select(total_score / total_probability, 0.0, total_probability == 0.0);
}

fn gaussian2D(x: f32, y: f32, mu_x: f32, mu_y: f32, sigma_x: f32, sigma_y: f32) -> f32 {
  let coef: f32 = 1.0 / (2.0 * 3.14159265 * sigma_x * sigma_y);
  let exp_part: f32 = exp(-((x - mu_x) * (x - mu_x) / (2.0 * sigma_x * sigma_x) + (y - mu_y) * (y - mu_y) / (2.0 * sigma_y * sigma_y)));
  return coef * exp_part;
}`;
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
      label: "benchmark optimal target bind group stage 1",
      layout: this.findOptimalPositionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.workgroupResultsBuffer } },
        { binding: 1, resource: { buffer: this.dartboardBuffer } },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    // Create bind group for second stage (only needs workgroup results and uniform)
    const bindGroup2 = this.device.createBindGroup({
      label: "benchmark optimal target bind group stage 2",
      layout: this.findGlobalOptimumPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.workgroupResultsBuffer } },
        { binding: 1, resource: { buffer: this.uniformBuffer } },
      ],
    });

    // Execute computation
    const encoder = this.device.createCommandEncoder({
      label: "benchmark optimal target encoder",
    });

    // First stage: find optimal positions within each workgroup
    const pass1 = encoder.beginComputePass({
      label: "benchmark optimal target compute pass stage 1",
    });
    pass1.setPipeline(this.findOptimalPositionPipeline);
    pass1.setBindGroup(0, bindGroup1);
    pass1.dispatchWorkgroups(this.numWorkgroups);
    pass1.end();

    // Second stage: find global optimum across workgroups
    const pass2 = encoder.beginComputePass({
      label: "benchmark optimal target compute pass stage 2",
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
}