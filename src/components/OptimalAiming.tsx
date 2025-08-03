import React, { useEffect, useState, useRef } from 'react';
import { CanvasVisualization } from './CanvasVisualization';
import { getDevice, width } from '../webgpu/util';
import { makeDartboard } from '../webgpu/dartboard';
import expected from 'bundle-text:../expected.wgsl';

export const OptimalAiming: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const renderBufferRef = useRef<GPUBuffer | null>(null);

  const computeExpected = async (canvas: HTMLCanvasElement) => {
    const device = await getDevice();
    if (!device) {
      console.error("Cannot continue without a device");
      return;
    }

    const module = device.createShaderModule({
      label: "expected score module",
      code: expected,
    });

    const pipeline = device.createComputePipeline({
      label: "expected score pipeline",
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

    const uniformData = new Uint32Array([width, width]);
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
      label: "doubling encoder",
    });
    const pass = encoder.beginComputePass({
      label: "doubling compute pass",
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(100);
    pass.end();

    encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    const start = Date.now();
    console.log("start compute expected score");
    await resultBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(resultBuffer.getMappedRange().slice(0));
    console.log("finish compute expected score", (Date.now() - start) / 1000);

    // Store the buffer for the render buffer tab
    renderBufferRef.current = workBuffer;

    resultBuffer.unmap();

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(width, width);
    const max = result.reduce((a, b) => Math.max(a, b), 0);

    for (let i = 0; i < result.length; i++) {
      const intensity = Math.floor(result[i] * (1 / max) * 255);
      imageData.data[i * 4 + 0] = intensity;
      imageData.data[i * 4 + 1] = intensity;
      imageData.data[i * 4 + 2] = intensity;
      imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  };

  useEffect(() => {
    setIsReady(true);
  }, []);

  return (
    <div>
      <h2>Optimal Aiming</h2>
      <p>The expected score when aiming at each position on the dartboard, calculated by summing probability-weighted scores across all possible hit locations. Brighter areas indicate higher expected scores, showing optimal aiming points.</p>
      {isReady && (
        <CanvasVisualization
          id="expected-score"
          width={width}
          height={width}
          onCanvasReady={computeExpected}
        />
      )}
    </div>
  );
};