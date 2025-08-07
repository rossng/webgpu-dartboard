import { REGULATION_BOARD } from "../dartboard/dartboard-definition";

/**
 * Calculate 2D gaussian distribution value at given coordinates
 */
export function gaussian2D(
  x: number,
  y: number,
  muX: number,
  muY: number,
  sigmaX: number,
  sigmaY: number,
): number {
  const coef = 1.0 / (2.0 * Math.PI * sigmaX * sigmaY);
  const expPart = Math.exp(
    -(
      ((x - muX) * (x - muX)) / (2.0 * sigmaX * sigmaX) +
      ((y - muY) * (y - muY)) / (2.0 * sigmaY * sigmaY)
    ),
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

/** Given the segment index (0-62), return the segment name */
export function getSegmentName(idx: number): string {
  // Special cases first
  if (idx === 61) return "50"; // Bull (50 points)
  if (idx === 60) return "25"; // Outer Bull (25 points)
  if (idx === 62) return "0"; // Miss (0 points)

  // Get the radial score for this slice
  let sliceIdx: number;
  let prefix = "";

  if (idx < 20) {
    // Single scores (0-19)
    sliceIdx = idx;
    prefix = "";
  } else if (idx < 40) {
    // Triple scores (20-39)
    sliceIdx = idx - 20;
    prefix = "T";
  } else if (idx < 60) {
    // Double scores (40-59)
    sliceIdx = idx - 40;
    prefix = "D";
  } else {
    // Invalid segment ID
    return "?";
  }

  // Get the dartboard score for this slice
  const score = REGULATION_BOARD.radialScores[sliceIdx];
  return prefix + score;
}
