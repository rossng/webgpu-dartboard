import React, { useEffect, useState, useCallback } from 'react';
import { CanvasVisualization } from './CanvasVisualization';
import { getDevice, width } from '../webgpu/util';
import { makeDartboard } from '../webgpu/dartboard';
import { getDartboardColor } from '../webgpu/dartboard-colors';
import weightedGrid from 'bundle-text:../weighted-grid.wgsl';

interface ScoreDistributionProps {
  showDartboardColors?: boolean;
}

export const ScoreDistribution: React.FC<ScoreDistributionProps> = ({ showDartboardColors }) => {
  const [isReady, setIsReady] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  const runScoreDistribution = useCallback(async (canvas: HTMLCanvasElement) => {
    const device = await getDevice();
    if (!device) {
      console.error("Cannot continue without a device");
      return;
    }

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
    device.queue.writeBuffer(dartboardBuffer, 0, dartboardScore);

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
  }, [showDartboardColors]);

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Force re-render of canvas when toggle changes
    setCanvasKey(prev => prev + 1);
  }, [showDartboardColors]);

  return (
    <div>
      <h2>Score Distribution</h2>
      <p>Shows the score-weighted probability distribution (probability × score at each position). Brighter areas contribute more to the expected score.</p>
      
      {isReady && (
        <CanvasVisualization
          key={canvasKey}
          id="score-distribution"
          width={width}
          height={width}
          onCanvasReady={runScoreDistribution}
        />
      )}
    </div>
  );
};