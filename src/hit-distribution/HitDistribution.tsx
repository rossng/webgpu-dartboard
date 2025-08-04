import React, { useEffect, useState, useCallback } from 'react';
import { CanvasVisualization } from '../common/CanvasVisualization';
import { TargetIndicator } from '../expected-score/TargetIndicator';
import { GaussianDistributionControls } from '../expected-score/GaussianDistributionControls';
import { TargetPositionDisplay } from '../expected-score/TargetPositionDisplay';
import { getDevice, width } from '../webgpu/util';
import { getDartboardColor } from '../dartboard/dartboard-colors';
import { drawRadialScores } from '../dartboard/dartboard-labels';
import segmentProbabilitiesShader from 'bundle-text:./segment-probabilities.wgsl';

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
  const [gaussianStddev, setGaussianStddev] = useState(55); // ~50mm

  const runHitDistribution = useCallback(async (canvas: HTMLCanvasElement) => {
    const device = await getDevice();
    if (!device) {
      console.error("Cannot continue without a device");
      return;
    }

    const module = device.createShaderModule({
      label: "segment probabilities module",
      code: segmentProbabilitiesShader,
    });

    const pipeline = device.createComputePipeline({
      label: "segment probabilities pipeline",
      layout: "auto",
      compute: {
        module,
        entryPoint: "computeSegmentProbabilities",
      },
    });

    const input = new Float32Array(width * width);
    const segmentSums = new Uint32Array(63); // 20 singles + 20 triples + 20 doubles + bull + outer bull + miss

    const workBuffer = device.createBuffer({
      label: "work buffer",
      size: input.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(workBuffer, 0, input);

    const segmentBuffer = device.createBuffer({
      label: "segment buffer",
      size: segmentSums.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(segmentBuffer, 0, segmentSums);

    const resultBuffer = device.createBuffer({
      label: "result buffer",
      size: input.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const segmentResultBuffer = device.createBuffer({
      label: "segment result buffer",
      size: segmentSums.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const uniformData = new Float32Array([width, width, targetPosition.x, targetPosition.y]);
    const uniformBuffer = device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const sigmaData = new Float32Array([gaussianStddev, gaussianStddev]);
    const sigmaBuffer = device.createBuffer({
      size: Math.max(sigmaData.byteLength, 16), // Ensure minimum 16 bytes for WebGPU
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(sigmaBuffer, 0, sigmaData);

    const bindGroup = device.createBindGroup({
      label: "bindGroup for work buffer",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        { binding: 1, resource: { buffer: uniformBuffer } },
        { binding: 2, resource: { buffer: segmentBuffer } },
        { binding: 3, resource: { buffer: sigmaBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder({
      label: "segment probabilities encoder",
    });
    const pass = encoder.beginComputePass({
      label: "segment probabilities compute pass",
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(width, width);
    pass.end();

    encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);
    encoder.copyBufferToBuffer(segmentBuffer, 0, segmentResultBuffer, 0, segmentResultBuffer.size);

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    await resultBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(resultBuffer.getMappedRange().slice(0));
    resultBuffer.unmap();

    await segmentResultBuffer.mapAsync(GPUMapMode.READ);
    const segmentResultsRaw = new Uint32Array(segmentResultBuffer.getMappedRange().slice(0));
    segmentResultBuffer.unmap();
    
    // Convert back from fixed-point integers to floats
    const segmentResults = new Float32Array(segmentResultsRaw.length);
    for (let i = 0; i < segmentResultsRaw.length; i++) {
      segmentResults[i] = segmentResultsRaw[i] / 1000000.0;
    }

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
          probability: segmentResults[i] / totalProbability
        });
      }
    }
    
    // Triples (20-39) 
    for (let i = 20; i < 40; i++) {
      if (segmentResults[i] > 0) {
        const scoreIndex = i - 20;
        probabilities.push({
          segment: `T${radialScores[scoreIndex]} (Triple)`,
          probability: segmentResults[i] / totalProbability
        });
      }
    }
    
    // Doubles (40-59)
    for (let i = 40; i < 60; i++) {
      if (segmentResults[i] > 0) {
        const scoreIndex = i - 40;
        probabilities.push({
          segment: `D${radialScores[scoreIndex]} (Double)`,
          probability: segmentResults[i] / totalProbability
        });
      }
    }
    
    // Outer Bull (60)
    if (segmentResults[60] > 0) {
      probabilities.push({
        segment: 'Outer Bull',
        probability: segmentResults[60] / totalProbability
      });
    }
    
    // Bull (61)
    if (segmentResults[61] > 0) {
      probabilities.push({
        segment: 'Bull',
        probability: segmentResults[61] / totalProbability
      });
    }
    
    // Miss (62)
    if (segmentResults[62] > 0) {
      probabilities.push({
        segment: 'Miss',
        probability: segmentResults[62] / totalProbability
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
    
    // Draw radial scores around the dartboard
    const centerX = width / 2;
    const centerY = width / 2;
    const labelRadius = width * 0.45; // Place labels outside the dartboard
    drawRadialScores(ctx, centerX, centerY, labelRadius, 14, '#fff');
  }, [showDartboardColors, targetPosition, gaussianStddev]);

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Force re-render of canvas when toggle, target, or stddev changes, but not during dragging
    if (!isDragging) {
      setCanvasKey(prev => prev + 1);
    }
  }, [showDartboardColors, targetPosition, gaussianStddev, isDragging]);

  return (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1 }}>
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
        <div style={{ marginTop: '20px' }}>
          <h3>Hit Probabilities by Segment</h3>
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '14px'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                    Segment
                  </th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                    Probability
                  </th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {segmentProbabilities.map((seg, index) => (
                  <tr 
                    key={`${seg.segment}-${index}`}
                    style={{ 
                      backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9',
                      borderBottom: '1px solid #eee'
                    }}
                  >
                    <td style={{ padding: '6px 8px' }}>{seg.segment}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {seg.probability.toFixed(6)}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      {(seg.probability * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ 
            marginTop: '10px', 
            fontSize: '12px', 
            color: '#666',
            textAlign: 'center'
          }}>
            <div style={{ marginTop: '4px' }}>
              Total Probability: {segmentProbabilities.reduce((sum, seg) => sum + seg.probability, 0).toFixed(6)} 
              <span style={{ color: segmentProbabilities.reduce((sum, seg) => sum + seg.probability, 0) > 0.999 ? '#28a745' : '#dc3545', marginLeft: '4px' }}>
                ({(segmentProbabilities.reduce((sum, seg) => sum + seg.probability, 0) * 100).toFixed(2)}%)
              </span>
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
            Display visualizations with traditional dartboard colors (green and cream segments).
          </p>
        </div>

        <GaussianDistributionControls
          gaussianStddevPixels={gaussianStddev}
          onGaussianStddevPixelsChange={setGaussianStddev}
        />

        <TargetPositionDisplay 
          targetPosition={targetPosition} 
          onTargetPositionChange={setTargetPosition}
        />
      </div>
    </div>
  );
};