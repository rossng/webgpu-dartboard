import shader from "bundle-text:./shader.wgsl";
import { makeDartboard } from "./dartboard";

const width = 500;
const height = 500;

async function init() {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    fail("need a browser that supports WebGPU");
    return;
  }

  const module = device.createShaderModule({
    label: "doubling compute module",
    code: shader,
  });

  const pipeline = device.createComputePipeline({
    label: "doubling compute pipeline",
    layout: "auto",
    compute: {
      module,
      entryPoint: "computeSomething",
    },
  });

  const input = new Float32Array(width * height);

  // create a buffer on the GPU to hold our computation
  // input and output
  const workBuffer = device.createBuffer({
    label: "work buffer",
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  // Copy our input data to that buffer
  device.queue.writeBuffer(workBuffer, 0, input);

  // create a buffer on the GPU to get a copy of the results
  const resultBuffer = device.createBuffer({
    label: "result buffer",
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const uniformData = new Uint32Array([width, height]); // Replace x and y with your values
  const uniformBuffer = device.createBuffer({
    size: uniformData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // const dartboardScore = new Uint32Array()

  // Setup a bindGroup to tell the shader which
  // buffer to use for the computation
  const bindGroup = device.createBindGroup({
    label: "bindGroup for work buffer",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: workBuffer } },
      { binding: 1, resource: { buffer: uniformBuffer } },
    ],
  });

  // Encode commands to do the computation
  const encoder = device.createCommandEncoder({
    label: "doubling encoder",
  });
  const pass = encoder.beginComputePass({
    label: "doubling compute pass",
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(width, height);
  pass.end();

  // Encode a command to copy the results to a mappable buffer.
  encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

  // Finish encoding and submit the commands
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);

  // Read the results
  await resultBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(resultBuffer.getMappedRange().slice(0));
  resultBuffer.unmap();

  const canvas = document.getElementById("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  canvas.height = height;
  canvas.width = width;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  // Assuming 'data' is your Float32Array with 800*600 numbers
  const imageData = ctx.createImageData(width, height);

  const max = result.reduce((a, b) => Math.max(a, b), 0);

  // Map float values to pixel data
  for (let i = 0; i < result.length; i++) {
    // Example mapping: float value to grayscale intensity
    // Modify this mapping based on your data's range and desired visual representation
    const intensity = Math.floor(result[i] * (1 / max) * 255);

    // Each pixel requires 4 slots in the array (R, G, B, A)
    imageData.data[i * 4 + 0] = intensity; // R
    imageData.data[i * 4 + 1] = intensity; // G
    imageData.data[i * 4 + 2] = intensity; // B
    imageData.data[i * 4 + 3] = 255; // A, fully opaque
  }

  // Draw the imageData onto the canvas
  ctx.putImageData(imageData, 0, 0);
}

async function initDartboard() {
  const width = 500;
  const dartboard = makeDartboard(width);
  const canvas = document.getElementById("dartboard");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  canvas.height = width;
  canvas.width = width;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const imageData = ctx.createImageData(width, width);
  for (let i = 0; i < dartboard.length; i++) {
    const intensity = (dartboard[i] * 255) / 50;
    imageData.data[i * 4 + 0] = intensity; // R
    imageData.data[i * 4 + 1] = intensity; // G
    imageData.data[i * 4 + 2] = intensity; // B
    imageData.data[i * 4 + 3] = 255; // A, fully opaque
  }

  ctx.putImageData(imageData, 0, 0);
}

init();
initDartboard();

function fail(msg: string) {
  // eslint-disable-next-line no-alert
  alert(msg);
}
