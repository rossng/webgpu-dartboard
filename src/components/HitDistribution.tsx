import React, { useEffect, useState, useCallback } from 'react';
import { CanvasVisualization } from './CanvasVisualization';
import { TargetIndicator } from './TargetIndicator';
import { getDevice, width } from '../webgpu/util';
import { getDartboardColor } from '../webgpu/dartboard-colors';
import hitDistribution from 'bundle-text:../hit-distribution.wgsl';

interface HitDistributionProps {
  showDartboardColors?: boolean;
  targetPosition?: { x: number; y: number };
  onTargetPositionChange?: (position: { x: number; y: number }) => void;
}

export const HitDistribution: React.FC<HitDistributionProps> = ({ 
  showDartboardColors, 
  targetPosition = { x: 0, y: 0 },
  onTargetPositionChange
}) => {
  const [isReady, setIsReady] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const runHitDistribution = useCallback(async (canvas: HTMLCanvasElement) => {
    const device = await getDevice();
    if (!device) {
      console.error("Cannot continue without a device");
      return;
    }

    const module = device.createShaderModule({
      label: "hit distribution module",
      code: hitDistribution,
    });

    const pipeline = device.createComputePipeline({
      label: "hit distribution pipeline",
      layout: "auto",
      compute: {
        module,
        entryPoint: "computeHitDistribution",
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

    const uniformData = new Float32Array([width, width, targetPosition.x, targetPosition.y]);
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
      label: "hit distribution encoder",
    });
    const pass = encoder.beginComputePass({
      label: "hit distribution compute pass",
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
      // Grayscale rendering
      for (let i = 0; i < result.length; i++) {
        const intensity = max > 0 ? Math.floor(result[i] * (1 / max) * 255) : 0;
        imageData.data[i * 4 + 0] = intensity;
        imageData.data[i * 4 + 1] = intensity;
        imageData.data[i * 4 + 2] = intensity;
        imageData.data[i * 4 + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [showDartboardColors, targetPosition]);

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Force re-render of canvas when toggle or target changes, but not during dragging
    if (!isDragging) {
      setCanvasKey(prev => prev + 1);
    }
  }, [showDartboardColors, targetPosition, isDragging]);

  return (
    <div>
      <h2>Hit Distribution</h2>
      <p>Shows the probability distribution of where darts will land when aiming at the target location, based on a 2D Gaussian distribution.</p>
      
      {isReady && (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <CanvasVisualization
            key={canvasKey}
            id="hit-distribution"
            width={width}
            height={width}
            onCanvasReady={runHitDistribution}
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
      )}
    </div>
  );
};