export function fail(msg: string) {
  console.error(msg);
}

export const width = 1000;

export async function getDevice() {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    fail("need a browser that supports WebGPU");
    return;
  }
  return device;
}
