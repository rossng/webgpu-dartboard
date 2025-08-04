import React, { useCallback, useRef, useEffect } from 'react';
import { CanvasVisualization } from './CanvasVisualization';
import { makeDartboard } from '../webgpu/dartboard';
import { drawRadialScores } from '../webgpu/dartboard-labels';

const WIDTH = 500;

export const Dartboard: React.FC = () => {
  const dartboardData = useRef<Uint32Array | null>(null);

  useEffect(() => {
    dartboardData.current = makeDartboard(WIDTH);
  }, []);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    if (!dartboardData.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(WIDTH, WIDTH);
    
    for (let i = 0; i < dartboardData.current.length; i++) {
      const intensity = (dartboardData.current[i] * 255) / 50;
      imageData.data[i * 4 + 0] = intensity; // R
      imageData.data[i * 4 + 1] = intensity; // G
      imageData.data[i * 4 + 2] = intensity; // B
      imageData.data[i * 4 + 3] = 255; // A, fully opaque
    }

    ctx.putImageData(imageData, 0, 0);
    
    // Draw radial scores around the dartboard
    const centerX = WIDTH / 2;
    const centerY = WIDTH / 2;
    const labelRadius = WIDTH * 0.45; // Place labels outside the dartboard
    drawRadialScores(ctx, centerX, centerY, labelRadius, 14, '#fff');
  }, []);

  return (
    <div>
      <h2>Dartboard</h2>
      <p>A visual representation of the dartboard with different scoring regions. Brightness corresponds to score value - triple 20 (60 points) appears brightest, followed by other high-scoring areas.</p>
      <CanvasVisualization
        id="dartboard"
        width={WIDTH}
        height={WIDTH}
        onCanvasReady={handleCanvasReady}
      />
    </div>
  );
};