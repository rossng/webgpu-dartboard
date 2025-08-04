import expected from "bundle-text:../expected.wgsl";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueuedComputation } from "../hooks/useQueuedComputation";
import { makeDartboard } from "../webgpu/dartboard";
import { drawRadialScores, drawSegmentBoundaries } from "../webgpu/dartboard-labels";
import { getDevice, width } from "../webgpu/util";
import { getViridisColor } from "../webgpu/viridis";
import { CanvasVisualization } from "./CanvasVisualization";
import { GaussianDistributionControls } from "./GaussianDistributionControls";
import { TargetIndicator } from "./TargetIndicator";
import { TargetPositionDisplay } from "./TargetPositionDisplay";

interface ExpectedScoreProps {}

export const ExpectedScore: React.FC<ExpectedScoreProps> = () => {
  const [isReady, setIsReady] = useState(false);
  const renderBufferRef = useRef<GPUBuffer | null>(null);
  const [expectedScoreRange, setExpectedScoreRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: 0,
  });
  const [expectedScoreAtTarget, setExpectedScoreAtTarget] = useState<number | null>(null);
  const resultDataRef = useRef<Float32Array | null>(null);
  const [_isDragging, setIsDragging] = useState(false);
  const [computationCounter, setComputationCounter] = useState(0);
  const [gaussianStddev, setGaussianStddev] = useState(55); // ~50mm
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [showSegmentBoundaries, setShowSegmentBoundaries] = useState(true);
  const [showHighestScore, setShowHighestScore] = useState(true);
  const [highestScorePosition, setHighestScorePosition] = useState<{ x: number; y: number } | null>(null);

  // Debouncing state
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateExpectedScoreAtTarget = useCallback(() => {
    if (resultDataRef.current && targetPosition) {
      // Convert normalized coordinates (-1 to 1) to pixel coordinates (0 to width)
      const x = Math.floor((targetPosition.x + 1) * width * 0.5);
      const y = Math.floor((targetPosition.y + 1) * width * 0.5);

      if (x >= 0 && x < width && y >= 0 && y < width) {
        const index = y * width + x;
        setExpectedScoreAtTarget(resultDataRef.current[index]);
      }
    }
  }, [targetPosition]);

  const computeExpected = useCallback(
    async (canvas: HTMLCanvasElement) => {
      try {
        const device = await getDevice();
        if (!device) {
          console.error("Cannot continue without a device");
          return;
        }

        const module = device.createShaderModule({
          label: "expected score module",
          code: expected,
        });

        const pipeline = device.createComputePipeline({
          label: "expected score pipeline",
          layout: "auto",
          compute: {
            module,
            entryPoint: "computeSomething",
          },
        });

        const input = new Float32Array(width * width);

        const workBuffer = device.createBuffer({
          label: "work buffer",
          size: input.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(workBuffer, 0, input);

        const resultBuffer = device.createBuffer({
          label: "result buffer",
          size: input.byteLength,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        const uniformData = new Float32Array([width, width, gaussianStddev, gaussianStddev]);
        const uniformBuffer = device.createBuffer({
          size: uniformData.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        const dartboardScore = makeDartboard(width);
        const dartboardBuffer = device.createBuffer({
          label: "dartboard buffer",
          size: dartboardScore.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(dartboardBuffer, 0, dartboardScore.buffer);

        const bindGroup = device.createBindGroup({
          label: "bindGroup for work buffer",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: workBuffer } },
            { binding: 1, resource: { buffer: uniformBuffer } },
            { binding: 2, resource: { buffer: dartboardBuffer } },
          ],
        });

        const encoder = device.createCommandEncoder({
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
        device.queue.submit([commandBuffer]);

        const start = Date.now();
        console.log("start compute expected score");
        await resultBuffer.mapAsync(GPUMapMode.READ);

        const result = new Float32Array(resultBuffer.getMappedRange().slice(0));
        console.log("finish compute expected score", (Date.now() - start) / 1000);

        // Store the buffer for the render buffer tab
        renderBufferRef.current = workBuffer;

        resultBuffer.unmap();

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }

        const imageData = ctx.createImageData(width, width);
        const max = result.reduce((a, b) => Math.max(a, b), 0);
        const min = result.reduce((a, b) => Math.min(a, b), Infinity);

        // Find the position of the highest score
        const maxIndex = result.indexOf(max);
        const maxY = Math.floor(maxIndex / width);
        const maxX = maxIndex % width;
        
        // Convert pixel coordinates to normalized coordinates (-1 to 1)
        const normalizedX = (maxX / width) * 2 - 1;
        const normalizedY = (maxY / width) * 2 - 1;
        setHighestScorePosition({ x: normalizedX, y: normalizedY });

        // Store the result data for mouse hover
        resultDataRef.current = result;
        setExpectedScoreRange({ min, max });

        // Signal that computation is complete
        setComputationCounter((prev) => prev + 1);

        // Apply viridis color map
        for (let i = 0; i < result.length; i++) {
          const intensity = max > min ? (result[i] - min) / (max - min) : 0;
          const color = getViridisColor(intensity);

          imageData.data[i * 4 + 0] = color.r;
          imageData.data[i * 4 + 1] = color.g;
          imageData.data[i * 4 + 2] = color.b;
          imageData.data[i * 4 + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);

        // Draw segment boundaries if enabled
        if (showSegmentBoundaries) {
          const centerX = width / 2;
          const centerY = width / 2;
          drawSegmentBoundaries(ctx, centerX, centerY, width, 0.3);
        }

        // Draw red dot at highest score position if enabled
        if (showHighestScore && highestScorePosition) {
          const dotX = (highestScorePosition.x + 1) * width * 0.5;
          const dotY = (highestScorePosition.y + 1) * width * 0.5;
          
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
        const centerX = width / 2;
        const centerY = width / 2;
        const labelRadius = width * 0.45; // Place labels outside the dartboard
        drawRadialScores(ctx, centerX, centerY, labelRadius, 14, "#fff");
      } catch (error) {
        console.error("Error computing expected scores:", error);
        throw error; // Re-throw so the hook can handle it
      }
    },
    [gaussianStddev, showSegmentBoundaries, showHighestScore],
  );

  // Use the queued computation hook
  const { executeComputation, isComputing } = useQueuedComputation(computeExpected);

  useEffect(() => {
    setIsReady(true);

    // Cleanup function to clear any pending timeouts
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Effect to handle segment boundaries and highest score display changes (immediate)
  useEffect(() => {
    if (!canvasRef.current || !isReady || isUserInteracting) return;

    executeComputation(canvasRef.current);
  }, [showSegmentBoundaries, showHighestScore, isReady, isUserInteracting, executeComputation]);

  // Effect to handle gaussian changes (debounced)
  useEffect(() => {
    if (!canvasRef.current || !isReady) return;

    // Cancel any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Always schedule a delayed computation, regardless of interaction state
    // This ensures we get the final value after user stops interacting
    debounceTimeoutRef.current = setTimeout(
      () => {
        if (canvasRef.current) {
          executeComputation(canvasRef.current);
        }
      },
      isUserInteracting ? 500 : 100,
    ); // Longer delay while interacting, shorter when not
  }, [gaussianStddev, isReady, isUserInteracting, executeComputation]);

  // Update expected score when target position changes OR computation completes
  useEffect(() => {
    updateExpectedScoreAtTarget();
  }, [updateExpectedScoreAtTarget, computationCounter]);

  const handleCanvasReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      canvasRef.current = canvas;
      executeComputation(canvas);
    },
    [executeComputation],
  );

  // Handle gaussian slider interactions
  const handleGaussianChange = useCallback((value: number) => {
    setGaussianStddev(value);
  }, []);

  const handleGaussianInteractionStart = useCallback(() => {
    setIsUserInteracting(true);
  }, []);

  const handleGaussianInteractionEnd = useCallback(() => {
    setIsUserInteracting(false);
  }, []);

  // Handle target position changes
  const handleTargetPositionChange = useCallback((position: { x: number; y: number }) => {
    setTargetPosition(position);
  }, []);

  const renderColorScale = () => {
    const scaleHeight = width; // Match canvas height
    const scaleWidth = 30;

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginLeft: "20px",
          position: "relative",
          height: scaleHeight,
        }}
      >
        <canvas
          width={scaleWidth}
          height={scaleHeight}
          style={{ border: "1px solid #ddd" }}
          ref={(canvas) => {
            if (canvas) {
              const ctx = canvas.getContext("2d");
              if (ctx) {
                const imageData = ctx.createImageData(scaleWidth, scaleHeight);
                for (let y = 0; y < scaleHeight; y++) {
                  const intensity = 1 - y / scaleHeight;
                  const color = getViridisColor(intensity);
                  for (let x = 0; x < scaleWidth; x++) {
                    const idx = (y * scaleWidth + x) * 4;
                    imageData.data[idx] = color.r;
                    imageData.data[idx + 1] = color.g;
                    imageData.data[idx + 2] = color.b;
                    imageData.data[idx + 3] = 255;
                  }
                }
                ctx.putImageData(imageData, 0, 0);
              }
            }
          }}
        />
        <div
          style={{
            position: "absolute",
            left: scaleWidth + 10,
            top: 0,
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          {expectedScoreRange.max.toFixed(1)}
        </div>
        <div
          style={{
            position: "absolute",
            left: scaleWidth + 10,
            bottom: 0,
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          {expectedScoreRange.min.toFixed(1)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex" }}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ flex: 1 }}>
        <h2>Expected Score</h2>
        <p>
          The expected score when aiming at each position on the dartboard, calculated by summing
          probability-weighted scores across all possible hit locations. Brighter areas indicate
          higher expected scores, showing optimal aiming points.
        </p>
        {isReady && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              {isComputing && (
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    width: "30px",
                    height: "30px",
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    borderRadius: "50%",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      border: "2px solid #f3f3f3",
                      borderTop: "2px solid #3498db",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                </div>
              )}
              <CanvasVisualization
                id="expected-score"
                width={width}
                height={width}
                onCanvasReady={handleCanvasReady}
              />
              <TargetIndicator
                targetPosition={targetPosition}
                onTargetPositionChange={handleTargetPositionChange}
                onDragStart={() => {
                  setIsDragging(true);
                  setIsUserInteracting(true);
                }}
                onDragEnd={() => {
                  setIsDragging(false);
                  setIsUserInteracting(false);
                }}
                canvasWidth={width}
                canvasHeight={width}
              />
            </div>
            {renderColorScale()}
            {expectedScoreAtTarget !== null && (
              <div
                style={{
                  marginLeft: "40px",
                  fontSize: "24px",
                  fontWeight: "bold",
                  minWidth: "120px",
                  display: "flex",
                  alignItems: "center",
                  height: width,
                }}
              >
                {expectedScoreAtTarget.toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Options sidebar */}
      <div
        style={{
          width: "300px",
          padding: "20px",
          backgroundColor: "#f8f8f8",
          borderLeft: "1px solid #ddd",
          overflow: "auto",
        }}
      >
        <h3>Options</h3>

        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showSegmentBoundaries}
              onChange={(e) => setShowSegmentBoundaries(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Show Segment Boundaries
          </label>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Overlay subtle lines showing dartboard segment divisions and scoring rings.
          </p>
        </div>

        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showHighestScore}
              onChange={(e) => setShowHighestScore(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Show Highest Expected Score
          </label>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Display a red dot at the position with the highest expected score on the dartboard.
          </p>
        </div>

        <GaussianDistributionControls
          gaussianStddevPixels={gaussianStddev}
          onGaussianStddevPixelsChange={handleGaussianChange}
          onInteractionStart={handleGaussianInteractionStart}
          onInteractionEnd={handleGaussianInteractionEnd}
        />

        <TargetPositionDisplay
          targetPosition={targetPosition}
          onTargetPositionChange={handleTargetPositionChange}
        />
      </div>
    </div>
  );
};
