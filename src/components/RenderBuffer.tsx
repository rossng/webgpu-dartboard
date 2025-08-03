import React, { useEffect, useState } from 'react';
import { CanvasVisualization } from './CanvasVisualization';
import { getDevice, width } from '../webgpu/util';

export const RenderBuffer: React.FC = () => {
  const [isReady, setIsReady] = useState(false);

  const handleCanvasReady = async (canvas: HTMLCanvasElement) => {
    const device = await getDevice();
    if (!device) {
      console.error("Cannot continue without a device");
      return;
    }

    // For now, just display a placeholder message
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, width);
    ctx.fillStyle = '#333';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Render Buffer', width / 2, width / 2);
    ctx.font = '14px Arial';
    ctx.fillText('(Run Expected Score first)', width / 2, width / 2 + 30);
  };

  useEffect(() => {
    setIsReady(true);
  }, []);

  return (
    <div>
      <h2>Render Buffer</h2>
      <p>This tab displays the GPU render buffer output from the Expected Score computation. It provides a WebGPU-rendered view of the computed data, demonstrating GPU-accelerated visualization capabilities.</p>
      {isReady && (
        <CanvasVisualization
          id="render-buffer"
          width={width}
          height={width}
          onCanvasReady={handleCanvasReady}
        />
      )}
    </div>
  );
};