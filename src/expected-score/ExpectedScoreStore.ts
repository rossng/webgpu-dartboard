import expected from "./expected.wgsl?raw";
import { makeDartboard } from "../dartboard/dartboard-definition";
import { drawRadialScores, drawSegmentBoundaries } from "../dartboard/dartboard-labels";
import { getDevice } from "../webgpu/util";

export const EXPECTED_SCORE_CANVAS_SIZE = 500;
import { getViridisColor } from "../webgpu/viridis";

export interface ExpectedScoreState {
  expectedScoreRange: { min: number; max: number };
  expectedScoreAtTarget: number | null;
  highestScorePosition: { x: number; y: number } | null;
  isComputing: boolean;
  resultData: Float32Array | null;
  renderBuffer: GPUBuffer | null;
  computationCounter: number;
}

export interface DisplayOptions {
  showSegmentBoundaries: boolean;
  showHighestScore: boolean;
}

export interface TargetPosition {
  x: number;
  y: number;
}

export class ExpectedScoreStore {
  private device: GPUDevice | null = null;
  private debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentComputation: Promise<void> | null = null;
  private queuedComputation: (() => void) | null = null;

  async initialize(): Promise<void> {
    const device = await getDevice();
    if (!device) {
      throw new Error("Cannot initialize without WebGPU device");
    }
    this.device = device;
  }

  async computeExpectedScore(
    gaussianStddev: number,
    displayOptions: DisplayOptions,
    onStateUpdate: (state: Partial<ExpectedScoreState>) => void,
  ): Promise<void> {
    // If computation is already running, queue this one
    if (this.currentComputation) {
      this.queuedComputation = () =>
        this.computeExpectedScore(gaussianStddev, displayOptions, onStateUpdate);
      return;
    }

    if (!this.device) {
      await this.initialize();
      if (!this.device) return;
    }

    onStateUpdate({ isComputing: true });

    const computationPromise = this.executeComputation(gaussianStddev, onStateUpdate);
    this.currentComputation = computationPromise;

    try {
      await computationPromise;
    } finally {
      this.currentComputation = null;
      onStateUpdate({ isComputing: false });

      // If there's a queued computation, start it
      if (this.queuedComputation) {
        const queuedFn = this.queuedComputation;
        this.queuedComputation = null;
        setTimeout(queuedFn, 0);
      }
    }
  }

  private async executeComputation(
    gaussianStddev: number,
    onStateUpdate: (state: Partial<ExpectedScoreState>) => void,
  ): Promise<void> {
    if (!this.device) return;

    try {
      const module = this.device.createShaderModule({
        label: "expected score module",
        code: expected,
      });

      const pipeline = this.device.createComputePipeline({
        label: "expected score pipeline",
        layout: "auto",
        compute: {
          module,
          entryPoint: "computeSomething",
        },
      });

      const input = new Float32Array(EXPECTED_SCORE_CANVAS_SIZE * EXPECTED_SCORE_CANVAS_SIZE);

      const workBuffer = this.device.createBuffer({
        label: "work buffer",
        size: input.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(workBuffer, 0, input);

      const resultBuffer = this.device.createBuffer({
        label: "result buffer",
        size: input.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const uniformData = new Float32Array([EXPECTED_SCORE_CANVAS_SIZE, EXPECTED_SCORE_CANVAS_SIZE, gaussianStddev, gaussianStddev]);
      const uniformBuffer = this.device.createBuffer({
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const dartboardScore = makeDartboard(EXPECTED_SCORE_CANVAS_SIZE);
      const dartboardBuffer = this.device.createBuffer({
        label: "dartboard buffer",
        size: dartboardScore.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(dartboardBuffer, 0, dartboardScore.buffer);

      const bindGroup = this.device.createBindGroup({
        label: "bindGroup for work buffer",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: workBuffer } },
          { binding: 1, resource: { buffer: uniformBuffer } },
          { binding: 2, resource: { buffer: dartboardBuffer } },
        ],
      });

      const encoder = this.device.createCommandEncoder({
        label: "doubling encoder",
      });
      const pass = encoder.beginComputePass({
        label: "doubling compute pass",
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(100);
      pass.end();

      encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

      const commandBuffer = encoder.finish();
      this.device.queue.submit([commandBuffer]);

      await resultBuffer.mapAsync(GPUMapMode.READ);

      const result = new Float32Array(resultBuffer.getMappedRange().slice(0));

      resultBuffer.unmap();

      const max = result.reduce((a, b) => Math.max(a, b), 0);
      const min = result.reduce((a, b) => Math.min(a, b), Infinity);

      // Find the position of the highest score
      const maxIndex = result.indexOf(max);
      const maxY = Math.floor(maxIndex / EXPECTED_SCORE_CANVAS_SIZE);
      const maxX = maxIndex % EXPECTED_SCORE_CANVAS_SIZE;

      // Convert pixel coordinates to normalized coordinates (-1 to 1)
      const normalizedX = (maxX / EXPECTED_SCORE_CANVAS_SIZE) * 2 - 1;
      const normalizedY = (maxY / EXPECTED_SCORE_CANVAS_SIZE) * 2 - 1;
      const highestScorePosition = { x: normalizedX, y: normalizedY };

      // Update state
      onStateUpdate({
        resultData: result,
        expectedScoreRange: { min, max },
        highestScorePosition,
        renderBuffer: workBuffer,
        computationCounter: Date.now(), // Use timestamp as counter
      });
    } catch (error) {
      console.error("Error computing expected scores:", error);
      throw error;
    }
  }

  renderToCanvas(
    canvas: HTMLCanvasElement,
    resultData: Float32Array,
    expectedScoreRange: { min: number; max: number },
    displayOptions: DisplayOptions,
    highestScorePosition: { x: number; y: number } | null,
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || !resultData) return;

    const imageData = ctx.createImageData(EXPECTED_SCORE_CANVAS_SIZE, EXPECTED_SCORE_CANVAS_SIZE);
    const { min, max } = expectedScoreRange;

    // Apply viridis color map
    for (let i = 0; i < resultData.length; i++) {
      const intensity = max > min ? (resultData[i] - min) / (max - min) : 0;
      const color = getViridisColor(intensity);

      imageData.data[i * 4 + 0] = color.r;
      imageData.data[i * 4 + 1] = color.g;
      imageData.data[i * 4 + 2] = color.b;
      imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw segment boundaries if enabled
    if (displayOptions.showSegmentBoundaries) {
      const centerX = EXPECTED_SCORE_CANVAS_SIZE / 2;
      const centerY = EXPECTED_SCORE_CANVAS_SIZE / 2;
      drawSegmentBoundaries(ctx, centerX, centerY, EXPECTED_SCORE_CANVAS_SIZE, 0.3);
    }

    // Draw red dot at highest score position if enabled
    if (displayOptions.showHighestScore && highestScorePosition) {
      const dotX = (highestScorePosition.x + 1) * EXPECTED_SCORE_CANVAS_SIZE * 0.5;
      const dotY = (highestScorePosition.y + 1) * EXPECTED_SCORE_CANVAS_SIZE * 0.5;

      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Add a white border for better visibility
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw radial scores around the dartboard
    const centerX = EXPECTED_SCORE_CANVAS_SIZE / 2;
    const centerY = EXPECTED_SCORE_CANVAS_SIZE / 2;
    const labelRadius = EXPECTED_SCORE_CANVAS_SIZE * 0.45; // Place labels outside the dartboard
    drawRadialScores(ctx, centerX, centerY, labelRadius, 14, "#fff");
  }

  getExpectedScoreAtPosition(
    resultData: Float32Array | null,
    targetPosition: TargetPosition,
  ): number | null {
    if (!resultData) return null;

    // Convert normalized coordinates (-1 to 1) to pixel coordinates (0 to EXPECTED_SCORE_CANVAS_SIZE)
    const x = Math.floor((targetPosition.x + 1) * EXPECTED_SCORE_CANVAS_SIZE * 0.5);
    const y = Math.floor((targetPosition.y + 1) * EXPECTED_SCORE_CANVAS_SIZE * 0.5);

    if (x >= 0 && x < EXPECTED_SCORE_CANVAS_SIZE && y >= 0 && y < EXPECTED_SCORE_CANVAS_SIZE) {
      const index = y * EXPECTED_SCORE_CANVAS_SIZE + x;
      return resultData[index];
    }

    return null;
  }

  debouncedCompute(
    gaussianStddev: number,
    displayOptions: DisplayOptions,
    onStateUpdate: (state: Partial<ExpectedScoreState>) => void,
    isUserInteracting: boolean = false,
  ): void {
    // Cancel any existing timeout
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId);
    }

    // Schedule delayed computation
    this.debounceTimeoutId = setTimeout(
      () => {
        this.computeExpectedScore(gaussianStddev, displayOptions, onStateUpdate);
      },
      isUserInteracting ? 500 : 100,
    );
  }

  cleanup(): void {
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId);
      this.debounceTimeoutId = null;
    }
  }
}

// Create a singleton instance
export const expectedScoreStore = new ExpectedScoreStore();
