import React, { useCallback, useEffect, useState } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { getDevice, width } from "../webgpu/util";
import { drawRadialScores } from "./dartboard-labels";
import scoreAreasShader from "./score-areas.wgsl?raw";

interface ScoreAreasProps {}

// Define all possible dartboard areas using numeric segment indexes (0-62)
// Based on utils.ts: 0-19=singles, 20-39=triples, 40-59=doubles, 60=outer bull, 61=bull, 62=miss
const DARTBOARD_AREAS = [
  { value: -1, label: "None (Full Dartboard)" }, // Special case for showing all
  { value: 61, label: "Bull (50)" },
  { value: 60, label: "Outer Bull (25)" },
  ...Array.from({ length: 20 }, (_, i) => {
    const scores = [6, 13, 4, 18, 1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10];
    const score = scores[i];
    return [
      { value: i, label: `${score} (Single)` }, // Single: index 0-19
      { value: i + 40, label: `D${score} (Double)` }, // Double: index 40-59
      { value: i + 20, label: `T${score} (Triple)` }, // Triple: index 20-39
    ];
  }).flat(),
];

export const ScoreAreas: React.FC<ScoreAreasProps> = () => {
  const [isReady, setIsReady] = useState(false);
  const [selectedArea, setSelectedArea] = useState(61);
  const [canvasKey, setCanvasKey] = useState(0);

  const runScoreAreas = useCallback(
    async (canvas: HTMLCanvasElement, overlayCanvas?: HTMLCanvasElement) => {
      const device = await getDevice();
      if (!device) {
        console.error("Cannot continue without a device");
        return;
      }

      // Get WebGPU context instead of 2D context
      const context = canvas.getContext("webgpu");
      if (!context) {
        console.error("Cannot get WebGPU context");
        return;
      }

      const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: canvasFormat,
      });

      const module = device.createShaderModule({
        label: "score areas module",
        code: scoreAreasShader,
      });

      const pipeline = device.createRenderPipeline({
        label: "score areas pipeline",
        layout: "auto",
        vertex: {
          module,
          entryPoint: "vs_main",
        },
        fragment: {
          module,
          entryPoint: "fs_main",
          targets: [
            {
              format: canvasFormat,
            },
          ],
        },
        primitive: {
          topology: "triangle-list",
        },
      });

      // Pass segment index directly (simpler than areaType+scoreValue)
      const uniformData = new Float32Array([width, width, selectedArea, 0]); // 4th component unused
      const uniformBuffer = device.createBuffer({
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const bindGroup = device.createBindGroup({
        label: "bindGroup for uniforms",
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      const encoder = device.createCommandEncoder({
        label: "score areas encoder",
      });

      const pass = encoder.beginRenderPass({
        label: "score areas render pass",
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6); // Draw full-screen quad (6 vertices)
      pass.end();

      const commandBuffer = encoder.finish();
      device.queue.submit([commandBuffer]);

      // Draw scores on overlay canvas if provided
      if (overlayCanvas) {
        const ctx = overlayCanvas.getContext("2d");
        if (ctx) {
          // Clear overlay
          ctx.clearRect(0, 0, width, width);

          // Draw radial scores around the dartboard
          const centerX = width / 2;
          const centerY = width / 2;
          const labelRadius = width * 0.45; // Place labels outside the dartboard
          drawRadialScores(ctx, centerX, centerY, labelRadius, 14, "#fff");
        }
      }
    },
    [selectedArea],
  );

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Force re-render of canvas when parameters change
    setCanvasKey((prev) => prev + 1);
  }, [selectedArea]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div>
        <label
          htmlFor="area-select"
          style={{ marginRight: "10px", fontWeight: "bold", display: "none" }}
        >
          Select Area:
        </label>
        <select
          id="area-select"
          value={selectedArea}
          onChange={(e) => setSelectedArea(parseInt(e.target.value))}
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

      {isReady && (
        <CanvasVisualization
          key={canvasKey}
          id="score-areas"
          width={width}
          height={width}
          onCanvasReady={runScoreAreas}
          showOverlay={true}
        />
      )}
    </div>
  );
};
