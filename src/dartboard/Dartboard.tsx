import React, { useCallback, useEffect, useRef } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { ViridisColorScale } from "../common/ViridisColorScale";
import { getViridisColor } from "../webgpu/viridis";
import { makeDartboard } from "./dartboard-definition";
import { drawRadialScores } from "./dartboard-labels";
import { ScoreAreas } from "./ScoreAreas";

const WIDTH = 1000;

export const Dartboard: React.FC = () => {
  const dartboardData = useRef<Uint32Array | null>(null);

  useEffect(() => {
    dartboardData.current = makeDartboard(WIDTH);
  }, []);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    if (!dartboardData.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(WIDTH, WIDTH);

    for (let i = 0; i < dartboardData.current.length; i++) {
      const score = dartboardData.current[i];
      const normalizedScore = score / 60; // Normalize to 0-1 (60 is max score)
      const color = getViridisColor(normalizedScore);

      imageData.data[i * 4 + 0] = color.r; // R
      imageData.data[i * 4 + 1] = color.g; // G
      imageData.data[i * 4 + 2] = color.b; // B
      imageData.data[i * 4 + 3] = 255; // A, fully opaque
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw radial scores around the dartboard
    const centerX = WIDTH / 2;
    const centerY = WIDTH / 2;
    const labelRadius = WIDTH * 0.45; // Place labels outside the dartboard
    drawRadialScores(ctx, centerX, centerY, labelRadius, 14, "#fff");
  }, []);

  return (
    <div>
      <h2>Dartboard</h2>
      <p>
        A visual representation of the dartboard with different scoring regions. Higher scores are
        shown in brighter yellow/green colors, lower scores in purple/blue.
      </p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
        <CanvasVisualization
          id="dartboard"
          width={WIDTH}
          height={WIDTH}
          onCanvasReady={handleCanvasReady}
        />
        <ViridisColorScale height={WIDTH} min={0} max={60} style={{ marginTop: "0" }} />
      </div>

      <div style={{ marginTop: "40px" }}>
        <h2>Explore Scoring Areas</h2>
        <ScoreAreas />
      </div>
    </div>
  );
};
