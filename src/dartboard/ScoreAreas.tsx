import scoreAreasShader from "bundle-text:./score-areas.wgsl";
import React, { useCallback, useEffect, useState } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { getDevice, width } from "../webgpu/util";
import { getDartboardColor } from "./dartboard-colors";
import { drawRadialScores } from "./dartboard-labels";

interface ScoreAreasProps {}

// Define all possible dartboard areas
const DARTBOARD_AREAS = [
  { value: "none", label: "None (Full Dartboard)" },
  { value: "bull", label: "Bull (50)" },
  { value: "outer-bull", label: "Outer Bull (25)" },
  ...Array.from({ length: 20 }, (_, i) => {
    const scores = [6, 13, 4, 18, 1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10];
    const score = scores[i];
    return [
      { value: `single-${score}`, label: `${score} (Single)` },
      { value: `double-${score}`, label: `D${score} (Double)` },
      { value: `triple-${score}`, label: `T${score} (Triple)` },
    ];
  }).flat(),
];

export const ScoreAreas: React.FC<ScoreAreasProps> = () => {
  const [isReady, setIsReady] = useState(false);
  const [selectedArea, setSelectedArea] = useState("bull");
  const [canvasKey, setCanvasKey] = useState(0);
  const [pixelCount, setPixelCount] = useState<number | null>(null);
  const [showDartboardColors, setShowDartboardColors] = useState(true);

  const runScoreAreas = useCallback(
    async (canvas: HTMLCanvasElement) => {
      const device = await getDevice();
      if (!device) {
        console.error("Cannot continue without a device");
        return;
      }

      const module = device.createShaderModule({
        label: "score areas module",
        code: scoreAreasShader,
      });

      const pipeline = device.createComputePipeline({
        label: "score areas pipeline",
        layout: "auto",
        compute: {
          module,
          entryPoint: "computeScoreAreas",
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

      // Parse selected area for shader parameters
      let areaType = 0; // 0: none, 1: bull, 2: outer-bull, 3: single, 4: double, 5: triple
      let scoreValue = 0;

      if (selectedArea === "bull") {
        areaType = 1;
      } else if (selectedArea === "outer-bull") {
        areaType = 2;
      } else if (selectedArea.startsWith("single-")) {
        areaType = 3;
        scoreValue = parseInt(selectedArea.split("-")[1]);
      } else if (selectedArea.startsWith("double-")) {
        areaType = 4;
        scoreValue = parseInt(selectedArea.split("-")[1]);
      } else if (selectedArea.startsWith("triple-")) {
        areaType = 5;
        scoreValue = parseInt(selectedArea.split("-")[1]);
      }

      const uniformData = new Float32Array([width, width, areaType, scoreValue]);
      const uniformBuffer = device.createBuffer({
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const bindGroup = device.createBindGroup({
        label: "bindGroup for work buffer",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: workBuffer } },
          { binding: 1, resource: { buffer: uniformBuffer } },
        ],
      });

      const encoder = device.createCommandEncoder({
        label: "score areas encoder",
      });
      const pass = encoder.beginComputePass({
        label: "score areas compute pass",
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

      // Count pixels in selected area
      const count = result.reduce((sum, value) => sum + (value > 0.5 ? 1 : 0), 0);
      setPixelCount(count);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.createImageData(width, width);

      if (showDartboardColors) {
        // Render with dartboard colors, highlighting selected areas
        for (let i = 0; i < result.length; i++) {
          const x = i % width;
          const y = Math.floor(i / width);
          const normX = (x / width) * 2 - 1;
          const normY = (y / width) * 2 - 1;

          // Get dartboard color at this position
          const color = getDartboardColor(normX, normY);

          // Highlight selected areas
          const isHighlighted = result[i] > 0.5;

          if (isHighlighted) {
            // Bright highlight for selected area
            imageData.data[i * 4 + 0] = Math.min(255, color.r * 1.5);
            imageData.data[i * 4 + 1] = Math.min(255, color.g * 1.5);
            imageData.data[i * 4 + 2] = Math.min(255, color.b * 1.5);
          } else {
            // Dimmed for non-selected areas
            imageData.data[i * 4 + 0] = color.r * 0.3;
            imageData.data[i * 4 + 1] = color.g * 0.3;
            imageData.data[i * 4 + 2] = color.b * 0.3;
          }
          imageData.data[i * 4 + 3] = 255;
        }
      } else {
        // Grayscale rendering
        for (let i = 0; i < result.length; i++) {
          const isHighlighted = result[i] > 0.5;
          const intensity = isHighlighted ? 255 : 64; // Bright white for selected, dark gray for others

          imageData.data[i * 4 + 0] = intensity;
          imageData.data[i * 4 + 1] = intensity;
          imageData.data[i * 4 + 2] = intensity;
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
    [showDartboardColors, selectedArea],
  );

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Force re-render of canvas when parameters change
    setCanvasKey((prev) => prev + 1);
  }, [showDartboardColors, selectedArea]);

  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <div style={{ flex: 1 }}>
        <p>
          Highlight specific scoring areas on the dartboard. Select an area from the dropdown to see
          it highlighted.
        </p>

        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="area-select" style={{ marginRight: "10px", fontWeight: "bold" }}>
            Select Area:
          </label>
          <select
            id="area-select"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              backgroundColor: "white",
              minWidth: "200px",
            }}
          >
            {DARTBOARD_AREAS.map((area) => (
              <option key={area.value} value={area.value}>
                {area.label}
              </option>
            ))}
          </select>
        </div>

        {pixelCount !== null && (
          <div
            style={{
              marginBottom: "20px",
              padding: "10px",
              backgroundColor: "#f0f0f0",
              borderRadius: "4px",
              fontSize: "14px",
            }}
          >
            <strong>Selected Area:</strong> {pixelCount.toLocaleString()} pixels
            {selectedArea !== "none" && (
              <span style={{ color: "#666", marginLeft: "10px" }}>
                ({((pixelCount / (width * width)) * 100).toFixed(2)}% of total area)
              </span>
            )}
          </div>
        )}

        {isReady && (
          <CanvasVisualization
            key={canvasKey}
            id="score-areas"
            width={width}
            height={width}
            onCanvasReady={runScoreAreas}
          />
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
      </div>
    </div>
  );
};
