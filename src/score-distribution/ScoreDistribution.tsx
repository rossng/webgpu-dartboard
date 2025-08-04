import segmentProbabilitiesShader from "bundle-text:../hit-distribution/segment-probabilities.wgsl";
import weightedGrid from "bundle-text:./weighted-grid.wgsl";
import React, { useCallback, useEffect, useState } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { getDartboardColor } from "../dartboard/dartboard-colors";
import { makeDartboard } from "../dartboard/dartboard-definition";
import { drawRadialScores } from "../dartboard/dartboard-labels";
import { GaussianDistributionControls } from "../expected-score/GaussianDistributionControls";
import { TargetIndicator } from "../expected-score/TargetIndicator";
import { TargetPositionDisplay } from "../expected-score/TargetPositionDisplay";
import { getDevice, width } from "../webgpu/util";
import { getViridisColor } from "../webgpu/viridis";

interface ScoreDistributionProps {}

interface SegmentProbability {
  segment: string;
  score: number;
  probability: number;
}

export const ScoreDistribution: React.FC<ScoreDistributionProps> = () => {
  const [isReady, setIsReady] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [segmentProbabilities, setSegmentProbabilities] = useState<SegmentProbability[]>([]);
  const [showDartboardColors, setShowDartboardColors] = useState(false);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [gaussianStddev, setGaussianStddev] = useState(55); // ~50mm

  const runScoreDistribution = useCallback(
    async (canvas: HTMLCanvasElement) => {
      const device = await getDevice();
      if (!device) {
        console.error("Cannot continue without a device");
        return;
      }

      // First run segment probabilities to get the table data
      const probModule = device.createShaderModule({
        label: "segment probabilities module",
        code: segmentProbabilitiesShader,
      });

      const probPipeline = device.createComputePipeline({
        label: "segment probabilities pipeline",
        layout: "auto",
        compute: {
          module: probModule,
          entryPoint: "computeSegmentProbabilities",
        },
      });

      const probInput = new Float32Array(width * width);
      const segmentSums = new Uint32Array(63); // 20 singles + 20 triples + 20 doubles + bull + outer bull + miss

      const probWorkBuffer = device.createBuffer({
        label: "prob work buffer",
        size: probInput.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(probWorkBuffer, 0, probInput);

      const segmentBuffer = device.createBuffer({
        label: "segment buffer",
        size: segmentSums.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(segmentBuffer, 0, segmentSums);

      const segmentResultBuffer = device.createBuffer({
        label: "segment result buffer",
        size: segmentSums.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const probUniformData = new Float32Array([width, width, targetPosition.x, targetPosition.y]);
      const probUniformBuffer = device.createBuffer({
        size: probUniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(probUniformBuffer, 0, probUniformData);

      const sigmaData = new Float32Array([gaussianStddev, gaussianStddev]);
      const sigmaBuffer = device.createBuffer({
        size: Math.max(sigmaData.byteLength, 16),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(sigmaBuffer, 0, sigmaData);

      const probBindGroup = device.createBindGroup({
        label: "bindGroup for prob buffer",
        layout: probPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: probWorkBuffer } },
          { binding: 1, resource: { buffer: probUniformBuffer } },
          { binding: 2, resource: { buffer: segmentBuffer } },
          { binding: 3, resource: { buffer: sigmaBuffer } },
        ],
      });

      const probEncoder = device.createCommandEncoder({
        label: "segment probabilities encoder",
      });
      const probPass = probEncoder.beginComputePass({
        label: "segment probabilities compute pass",
      });
      probPass.setPipeline(probPipeline);
      probPass.setBindGroup(0, probBindGroup);
      probPass.dispatchWorkgroups(width, width);
      probPass.end();

      probEncoder.copyBufferToBuffer(
        segmentBuffer,
        0,
        segmentResultBuffer,
        0,
        segmentResultBuffer.size,
      );

      const probCommandBuffer = probEncoder.finish();
      device.queue.submit([probCommandBuffer]);

      await segmentResultBuffer.mapAsync(GPUMapMode.READ);
      const segmentResultsRaw = new Uint32Array(segmentResultBuffer.getMappedRange().slice(0));
      segmentResultBuffer.unmap();

      // Convert back from fixed-point integers to floats
      const segmentResults = new Float32Array(segmentResultsRaw.length);
      for (let i = 0; i < segmentResultsRaw.length; i++) {
        segmentResults[i] = segmentResultsRaw[i] / 1000000.0;
      }

      // Process segment results and create probability table
      const radialScores = [6, 13, 4, 18, 1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10];
      const probabilities: SegmentProbability[] = [];

      // Calculate total probability for normalization
      const totalProbability = segmentResults.reduce((sum, val) => sum + val, 0);

      // Singles (0-19)
      for (let i = 0; i < 20; i++) {
        if (segmentResults[i] > 0) {
          probabilities.push({
            segment: `${radialScores[i]} (Single)`,
            score: radialScores[i],
            probability: segmentResults[i] / totalProbability,
          });
        }
      }

      // Triples (20-39)
      for (let i = 20; i < 40; i++) {
        if (segmentResults[i] > 0) {
          const scoreIndex = i - 20;
          probabilities.push({
            segment: `T${radialScores[scoreIndex]} (Triple)`,
            score: radialScores[scoreIndex] * 3,
            probability: segmentResults[i] / totalProbability,
          });
        }
      }

      // Doubles (40-59)
      for (let i = 40; i < 60; i++) {
        if (segmentResults[i] > 0) {
          const scoreIndex = i - 40;
          probabilities.push({
            segment: `D${radialScores[scoreIndex]} (Double)`,
            score: radialScores[scoreIndex] * 2,
            probability: segmentResults[i] / totalProbability,
          });
        }
      }

      // Outer Bull (60)
      if (segmentResults[60] > 0) {
        probabilities.push({
          segment: "Outer Bull",
          score: 25,
          probability: segmentResults[60] / totalProbability,
        });
      }

      // Bull (61)
      if (segmentResults[61] > 0) {
        probabilities.push({
          segment: "Bull",
          score: 50,
          probability: segmentResults[61] / totalProbability,
        });
      }

      // Miss (62)
      if (segmentResults[62] > 0) {
        probabilities.push({
          segment: "Miss",
          score: 0,
          probability: segmentResults[62] / totalProbability,
        });
      }

      // Sort by probability (highest first)
      probabilities.sort((a, b) => b.probability - a.probability);
      setSegmentProbabilities(probabilities);

      // Now run the main score distribution visualization
      const module = device.createShaderModule({
        label: "score distribution module",
        code: weightedGrid,
      });

      const pipeline = device.createComputePipeline({
        label: "score distribution pipeline",
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

      // Always compute score-weighted distribution
      const uniformData = new Uint32Array([width, width, 1, 0]);
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

      // Target position and stddev buffer (ensure minimum 16 bytes for WebGPU uniform buffer alignment)
      const targetData = new Float32Array([
        targetPosition.x,
        targetPosition.y,
        gaussianStddev,
        gaussianStddev,
      ]);
      const targetBuffer = device.createBuffer({
        size: Math.max(targetData.byteLength, 16),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(targetBuffer, 0, targetData);

      const bindGroup = device.createBindGroup({
        label: "bindGroup for work buffer",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: workBuffer } },
          { binding: 1, resource: { buffer: uniformBuffer } },
          { binding: 2, resource: { buffer: dartboardBuffer } },
          { binding: 3, resource: { buffer: targetBuffer } },
        ],
      });

      const encoder = device.createCommandEncoder({
        label: "score distribution encoder",
      });
      const pass = encoder.beginComputePass({
        label: "score distribution compute pass",
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(width, width);
      pass.end();

      encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

      const commandBuffer = encoder.finish();
      device.queue.submit([commandBuffer]);

      await resultBuffer.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(resultBuffer.getMappedRange().slice(0));
      resultBuffer.unmap();

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.createImageData(width, width);

      // Calculate max once, outside the loop
      const max = result.reduce((a, b) => Math.max(a, b), 0);

      if (showDartboardColors) {
        // Render with dartboard colors
        for (let i = 0; i < result.length; i++) {
          const x = i % width;
          const y = Math.floor(i / width);
          const normX = (x / width) * 2 - 1;
          const normY = (y / width) * 2 - 1;

          // Get dartboard color at this position
          const color = getDartboardColor(normX, normY);

          // Apply intensity based on the computed value
          const intensity = max > 0 ? result[i] / max : 0;

          imageData.data[i * 4 + 0] = color.r * intensity;
          imageData.data[i * 4 + 1] = color.g * intensity;
          imageData.data[i * 4 + 2] = color.b * intensity;
          imageData.data[i * 4 + 3] = 255;
        }
      } else {
        // Viridis color map rendering
        for (let i = 0; i < result.length; i++) {
          const intensity = max > 0 ? result[i] / max : 0;
          const color = getViridisColor(intensity);

          imageData.data[i * 4 + 0] = color.r;
          imageData.data[i * 4 + 1] = color.g;
          imageData.data[i * 4 + 2] = color.b;
          imageData.data[i * 4 + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // Draw radial scores around the dartboard
      const centerX = width / 2;
      const centerY = width / 2;
      const labelRadius = width * 0.45; // Place labels outside the dartboard
      drawRadialScores(ctx, centerX, centerY, labelRadius, 14, "#fff");
    },
    [showDartboardColors, targetPosition, gaussianStddev],
  );

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Force re-render of canvas when toggle, target, or stddev changes, but not during dragging
    if (!isDragging) {
      setCanvasKey((prev) => prev + 1);
    }
  }, [showDartboardColors, targetPosition, gaussianStddev, isDragging]);

  return (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1 }}>
        <h2>Score Distribution</h2>
        <p>
          Shows the score-weighted probability distribution (probability × score at each position).
          Brighter areas contribute more to the expected score.
        </p>

        {isReady && (
          <div style={{ position: "relative", display: "inline-block" }}>
            <CanvasVisualization
              key={canvasKey}
              id="score-distribution"
              width={width}
              height={width}
              onCanvasReady={runScoreDistribution}
            />
            <TargetIndicator
              targetPosition={targetPosition}
              onTargetPositionChange={setTargetPosition}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => setIsDragging(false)}
              canvasWidth={width}
              canvasHeight={width}
            />
          </div>
        )}

        {segmentProbabilities.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h3>Score Probabilities by Segment</h3>
            <div
              style={{
                maxHeight: "400px",
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5", position: "sticky", top: 0 }}>
                    <th
                      style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}
                    >
                      Segment
                    </th>
                    <th
                      style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}
                    >
                      Score
                    </th>
                    <th
                      style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}
                    >
                      Probability
                    </th>
                    <th
                      style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}
                    >
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segmentProbabilities.map((seg, index) => (
                    <tr
                      key={`${seg.segment}-${index}`}
                      style={{
                        backgroundColor: index % 2 === 0 ? "white" : "#f9f9f9",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <td style={{ padding: "6px 8px" }}>{seg.segment}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: "bold" }}>
                        {seg.score}
                      </td>
                      <td
                        style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}
                      >
                        {seg.probability.toFixed(6)}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        {(seg.probability * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              style={{
                marginTop: "10px",
                fontSize: "12px",
                color: "#666",
                textAlign: "center",
              }}
            >
              <div>
                Expected Score:{" "}
                {segmentProbabilities
                  .reduce((sum, seg) => sum + seg.score * seg.probability, 0)
                  .toFixed(2)}{" "}
                points
              </div>
              <div style={{ marginTop: "4px" }}>
                Total Probability:{" "}
                {segmentProbabilities.reduce((sum, seg) => sum + seg.probability, 0).toFixed(6)}
                <span
                  style={{
                    color:
                      segmentProbabilities.reduce((sum, seg) => sum + seg.probability, 0) > 0.999
                        ? "#28a745"
                        : "#dc3545",
                    marginLeft: "4px",
                  }}
                >
                  (
                  {(
                    segmentProbabilities.reduce((sum, seg) => sum + seg.probability, 0) * 100
                  ).toFixed(2)}
                  %)
                </span>
              </div>
            </div>
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
              checked={showDartboardColors}
              onChange={(e) => setShowDartboardColors(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Show Dartboard Colors
          </label>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Display visualizations with traditional dartboard colors (green and cream segments).
          </p>
        </div>

        <GaussianDistributionControls
          gaussianStddevPixels={gaussianStddev}
          onGaussianStddevPixelsChange={setGaussianStddev}
        />

        <TargetPositionDisplay
          targetPosition={targetPosition}
          onTargetPositionChange={setTargetPosition}
        />
      </div>
    </div>
  );
};
