/**
 * Common utilities for gaussian calculations used in tests
 */

/**
 * Calculate 2D gaussian distribution value at given coordinates
 */
export function gaussian2D(
  x: number,
  y: number,
  muX: number,
  muY: number,
  sigmaX: number,
  sigmaY: number
): number {
  const coef = 1.0 / (2.0 * Math.PI * sigmaX * sigmaY);
  const expPart = Math.exp(
    -((x - muX) * (x - muX) / (2.0 * sigmaX * sigmaX) + 
      (y - muY) * (y - muY) / (2.0 * sigmaY * sigmaY))
  );
  return coef * expPart;
}

/**
 * Convert normalized target coordinate to pixel coordinate
 */
export function convertTargetToPixel(target: number, dimension: number): number {
  return (target + 1.0) * dimension * 0.5;
}

/**
 * Find the index of the maximum value in a Float32Array
 */
export function findMaxIndex(arr: Float32Array): number {
  let maxIdx = 0;
  let maxVal = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > maxVal) {
      maxVal = arr[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}