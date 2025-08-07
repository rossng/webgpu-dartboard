import segmentProbabilitiesShader from "./segment-probabilities.wgsl?raw";

export interface SegmentProbabilitiesParams {
  /** Width of the canvas in pixels */
  width: number;
  /** Height of the canvas in pixels */
  height: number;
  /** Horizontal centre of the probability distribution in NDC (-1 to 1) */
  targetX: number;
  /** Vertical centre of the probability distribution in NDC (-1 to 1) */
  targetY: number;
  sigmaX: number;
  sigmaY: number;
}

export interface SegmentProbabilitiesResult {
  hitData: Float32Array;
  segmentSums: Float32Array;
  segmentSumsRaw: Uint32Array;
}

export async function runSegmentProbabilitiesShader(
  device: GPUDevice,
  params: SegmentProbabilitiesParams,
): Promise<SegmentProbabilitiesResult> {
  const { width, height, targetX, targetY, sigmaX, sigmaY } = params;
  const scalingFactor = 500000000.0;

  const shaderModule = device.createShaderModule({
    label: "segment probabilities module",
    code: segmentProbabilitiesShader,
  });

  const pipeline = device.createComputePipeline({
    label: "segment probabilities pipeline",
    layout: "auto",
    compute: {
      module: shaderModule,
      entryPoint: "computeSegmentProbabilities",
    },
  });

  const hitDataSize = width * height * 4;
  const segmentSumsSize = 63 * 4;

  const hitDataBuffer = device.createBuffer({
    label: "hit data buffer",
    size: hitDataSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const paramsBuffer = device.createBuffer({
    label: "params buffer",
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const segmentSumsBuffer = device.createBuffer({
    label: "segment sums buffer",
    size: segmentSumsSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  const sigmasBuffer = device.createBuffer({
    label: "sigmas buffer",
    size: Math.max(8, 16),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const segmentSumsInit = new Uint32Array(63);
  device.queue.writeBuffer(segmentSumsBuffer, 0, segmentSumsInit);

  const paramsData = new Float32Array([width, height, targetX, targetY]);
  device.queue.writeBuffer(paramsBuffer, 0, paramsData);

  const sigmasData = new Float32Array([sigmaX, sigmaY]);
  device.queue.writeBuffer(sigmasBuffer, 0, sigmasData);

  const hitDataResultBuffer = device.createBuffer({
    label: "hit data result buffer",
    size: hitDataSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const segmentSumsResultBuffer = device.createBuffer({
    label: "segment sums result buffer",
    size: segmentSumsSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: "segment probabilities bind group",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: hitDataBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: { buffer: segmentSumsBuffer } },
      { binding: 3, resource: { buffer: sigmasBuffer } },
    ],
  });

  const encoder = device.createCommandEncoder({
    label: "segment probabilities encoder",
  });

  const computePass = encoder.beginComputePass({
    label: "segment probabilities compute pass",
  });

  computePass.setPipeline(pipeline);
  computePass.setBindGroup(0, bindGroup);
  computePass.dispatchWorkgroups(width, height);
  computePass.end();

  encoder.copyBufferToBuffer(hitDataBuffer, 0, hitDataResultBuffer, 0, hitDataSize);
  encoder.copyBufferToBuffer(segmentSumsBuffer, 0, segmentSumsResultBuffer, 0, segmentSumsSize);

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);

  await hitDataResultBuffer.mapAsync(GPUMapMode.READ);
  const hitDataArrayBuffer = hitDataResultBuffer.getMappedRange();
  const hitData = new Float32Array(hitDataArrayBuffer.slice(0));
  hitDataResultBuffer.unmap();

  await segmentSumsResultBuffer.mapAsync(GPUMapMode.READ);
  const segmentSumsArrayBuffer = segmentSumsResultBuffer.getMappedRange();
  const segmentSumsRaw = new Uint32Array(segmentSumsArrayBuffer.slice(0));
  segmentSumsResultBuffer.unmap();

  const segmentSums = new Float32Array(segmentSumsRaw.length);
  for (let i = 0; i < segmentSumsRaw.length; i++) {
    segmentSums[i] = segmentSumsRaw[i] / scalingFactor;
  }

  hitDataBuffer.destroy();
  paramsBuffer.destroy();
  segmentSumsBuffer.destroy();
  sigmasBuffer.destroy();
  hitDataResultBuffer.destroy();
  segmentSumsResultBuffer.destroy();

  return { hitData, segmentSums, segmentSumsRaw };
}
