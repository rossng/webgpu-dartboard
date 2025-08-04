import expected from "bundle-text:../expected.wgsl";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { makeDartboard } from "../webgpu/dartboard";
import { getDevice, width } from "../webgpu/util";
import { getViridisColor } from "../webgpu/viridis";
import { CanvasVisualization } from "./CanvasVisualization";
import { TargetIndicator } from "./TargetIndicator";
import { drawSegmentBoundaries, drawRadialScores } from "../webgpu/dartboard-labels";

interface ExpectedScoreProps {
  gaussianStddev?: number;
  targetPosition?: { x: number; y: number };
  onTargetPositionChange?: (position: { x: number; y: number }) => void;
  showSegmentBoundaries?: boolean;
}

export const ExpectedScore: React.FC<ExpectedScoreProps> = ({
  gaussianStddev = 100,
  targetPosition = { x: 0, y: 0 },
  onTargetPositionChange,
  showSegmentBoundaries = false,
}) => {
  const [isReady, setIsReady] = useState(false);
  const renderBufferRef = useRef<GPUBuffer | null>(null);
  const [expectedScoreRange, setExpectedScoreRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: 0,
  });
  const [expectedScoreAtTarget, setExpectedScoreAtTarget] = useState<number | null>(null);
  const resultDataRef = useRef<Float32Array | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [computationCounter, setComputationCounter] = useState(0);

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
      setIsComputing(true);

      try {
        const device = await getDevice();
        if (!device) {
          console.error("Cannot continue without a device");
          setIsComputing(false);
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
          setIsComputing(false);
          return;
        }

        const imageData = ctx.createImageData(width, width);
        const max = result.reduce((a, b) => Math.max(a, b), 0);
        const min = result.reduce((a, b) => Math.min(a, b), Infinity);

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
        
        // Draw radial scores around the dartboard
        const centerX = width / 2;
        const centerY = width / 2;
        const labelRadius = width * 0.45; // Place labels outside the dartboard
        drawRadialScores(ctx, centerX, centerY, labelRadius, 14, '#fff');
      } catch (error) {
        console.error("Error computing expected scores:", error);
      } finally {
        setIsComputing(false);
      }
    },
    [gaussianStddev, showSegmentBoundaries],
  );

  useEffect(() => {
    setIsReady(true);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Re-compute when stddev or segment boundaries toggle changes
    if (canvasRef.current && isReady) {
      console.log("re-computing expected score", gaussianStddev, showSegmentBoundaries, isReady);
      computeExpected(canvasRef.current);
    }
  }, [gaussianStddev, showSegmentBoundaries, isReady]); // Remove computeExpected from dependencies

  // Update expected score when target position changes OR computation completes
  useEffect(() => {
    updateExpectedScoreAtTarget();
  }, [updateExpectedScoreAtTarget, computationCounter]);

  const handleCanvasReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      canvasRef.current = canvas;
      computeExpected(canvas);
    },
    [computeExpected],
  );

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
    <div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
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
            {onTargetPositionChange && (
              <TargetIndicator
                targetPosition={targetPosition}
                onTargetPositionChange={onTargetPositionChange}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={() => setIsDragging(false)}
                canvasWidth={width}
                canvasHeight={width}
              />
            )}
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
  );
};
