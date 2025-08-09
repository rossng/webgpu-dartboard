import { useAtom } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { getDartboardColor } from "../dartboard/dartboard-colors";
import { pixelsToMm } from "../dartboard/dartboard-definition";
import { drawRadialScores } from "../dartboard/dartboard-labels";
import { GaussianDistributionControls } from "../expected-score/GaussianDistributionControls";
import { TargetIndicator } from "../expected-score/TargetIndicator";
import { TargetPositionDisplay } from "../expected-score/TargetPositionDisplay";
import { gaussianStddevMmAtom, getGaussianStddevPixels } from "../shared/gaussianStddevAtom";
import { targetPositionAtom } from "../shared/targetPositionAtom";
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
  const [targetPosition, setTargetPosition] = useAtom(targetPositionAtom);
  const [gaussianStddevMm, setGaussianStddevMm] = useAtom(gaussianStddevMmAtom);

  // Convert mm to pixels for calculations
  const gaussianStddevPixels = getGaussianStddevPixels(gaussianStddevMm, width);

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
    <div className="flex gap-2.5">
      <div className="flex-1">
        <p className="mb-4 text-gray-700">
          The problem with darts is that you never hit exactly where you aim. (Well, I certainly
          don't.)
        </p>

        <p className="mb-6 text-gray-700">
          Drag the crosshairs around to see where your darts might land. I've assumed that the
          spread can be modelled as a 2D Gaussian distribution.
        </p>

        {isReady && (
          <div className="relative inline-block">
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
          <div className="mt-5">
            <h3 className="text-lg font-semibold mb-4">Hit Probabilities by Segment</h3>
            <div className="max-h-table overflow-y-auto border border-gray-300 rounded">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 sticky top-0">
                    <th className="p-2 text-left border-b border-gray-300">
                      Segment
                    </th>
                    <th className="p-2 text-right border-b border-gray-300">
                      Probability
                    </th>
                    <th className="p-2 text-right border-b border-gray-300">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segmentProbabilities.map((seg, index) => (
                    <tr
                      key={`${seg.segment}-${index}`}
                      className={`${
                        index % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } border-b border-gray-200`}
                    >
                      <td className="px-2 py-1.5">{seg.segment}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {seg.probability.toFixed(6)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {(seg.probability * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Options sidebar */}
      <div className="sidebar-section">
        <h3 className="text-lg font-semibold mb-4">Options</h3>

        <div className="mt-5">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showDartboardColors}
              onChange={(e) => setShowDartboardColors(e.target.checked)}
              className="mr-2"
            />
            Show Dartboard Colors
          </label>
          <p className="text-sm text-gray-600 mt-2">
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
