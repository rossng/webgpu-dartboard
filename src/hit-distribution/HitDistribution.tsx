import React, { useCallback, useEffect, useState } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { getDartboardColor } from "../dartboard/dartboard-colors";
import { mmToPixels, pixelsToMm } from "../dartboard/dartboard-definition";
import { drawRadialScores } from "../dartboard/dartboard-labels";
import { GaussianDistributionControls } from "../expected-score/GaussianDistributionControls";
import { TargetIndicator } from "../expected-score/TargetIndicator";
import { TargetPositionDisplay } from "../expected-score/TargetPositionDisplay";
import { getDevice, width } from "../webgpu/util";
import { getViridisColor } from "../webgpu/viridis";
import { runSegmentProbabilitiesShader } from "./segment-probabilities";

interface HitDistributionProps {}

interface SegmentProbability {
  segment: string;
  probability: number;
}

export const HitDistribution: React.FC<HitDistributionProps> = () => {
  const [isReady, setIsReady] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [segmentProbabilities, setSegmentProbabilities] = useState<SegmentProbability[]>([]);
  const [showDartboardColors, setShowDartboardColors] = useState(true);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [gaussianStddevMm, setGaussianStddevMm] = useState(50); // 50mm default

  // Convert mm to pixels for calculations
  const gaussianStddevPixels = mmToPixels(gaussianStddevMm, width);

  const runHitDistribution = useCallback(
    async (canvas: HTMLCanvasElement) => {
      const device = await getDevice();
      if (!device) {
        console.error("Cannot continue without a device");
        return;
      }

      const { hitData: result, segmentSums: segmentResults } = await runSegmentProbabilitiesShader(
        device,
        {
          width,
          height: width,
          targetX: targetPosition.x,
          targetY: targetPosition.y,
          sigmaX: gaussianStddevPixels,
          sigmaY: gaussianStddevPixels,
        },
      );

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
            probability: segmentResults[i] / totalProbability,
          });
        }
      }

      // Outer Bull (60)
      if (segmentResults[60] > 0) {
        probabilities.push({
          segment: "Outer Bull",
          probability: segmentResults[60] / totalProbability,
        });
      }

      // Bull (61)
      if (segmentResults[61] > 0) {
        probabilities.push({
          segment: "Bull",
          probability: segmentResults[61] / totalProbability,
        });
      }

      // Miss (62)
      if (segmentResults[62] > 0) {
        probabilities.push({
          segment: "Miss",
          probability: segmentResults[62] / totalProbability,
        });
      }

      // Sort by probability (highest first)
      probabilities.sort((a, b) => b.probability - a.probability);
      setSegmentProbabilities(probabilities);

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
        // Viridis color rendering
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
    [showDartboardColors, targetPosition, gaussianStddevPixels],
  );

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Force re-render of canvas when toggle, target, or stddev changes, but not during dragging
    if (!isDragging) {
      setCanvasKey((prev) => prev + 1);
    }
  }, [showDartboardColors, targetPosition, gaussianStddevPixels, isDragging]);

  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <div style={{ flex: 1 }}>
        <h2>Hit Distribution</h2>
        <p>
          Shows the probability distribution of where darts will land when aiming at the target
          location, based on a 2D Gaussian distribution.
        </p>

        {isReady && (
          <div style={{ position: "relative", display: "inline-block" }}>
            <CanvasVisualization
              key={canvasKey}
              id="hit-distribution"
              width={width}
              height={width}
              onCanvasReady={runHitDistribution}
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
            <h3>Hit Probabilities by Segment</h3>
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
              <div style={{ marginTop: "4px" }}>
                Total Probability:{" "}
                {segmentProbabilities.reduce((sum, seg) => sum + seg.probability, 0).toFixed(2)}
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
            Use traditional dartboard colors.
          </p>
        </div>

        <GaussianDistributionControls
          gaussianStddevPixels={gaussianStddevPixels}
          onGaussianStddevPixelsChange={(pixels) => setGaussianStddevMm(pixelsToMm(pixels, width))}
        />

        <TargetPositionDisplay
          targetPosition={targetPosition}
          onTargetPositionChange={setTargetPosition}
        />
      </div>
    </div>
  );
};
