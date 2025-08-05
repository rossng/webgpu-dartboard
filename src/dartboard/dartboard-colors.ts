import { REGULATION_BOARD, normaliseDartboard } from './dartboard-definition';

export interface DartboardColor {
  r: number;
  g: number;
  b: number;
}

/** Get the dartboard color at normalized coordinates */
export function getDartboardColor(x: number, y: number): DartboardColor {
  const dartboard = normaliseDartboard(REGULATION_BOARD);
  const r = Math.sqrt(x * x + y * y);

  // Double bull (red center)
  if (r < dartboard.doubleBullDiameter / 2) {
    return { r: 255, g: 0, b: 0 }; // Red
  }

  // Bull (green)
  if (r < dartboard.bullDiameter / 2) {
    return { r: 0, g: 128, b: 0 }; // Green
  }

  // Outside dartboard
  if (r > dartboard.centerToOuterDouble) {
    return { r: 0, g: 0, b: 0 }; // Black
  }

  const theta = Math.atan2(y, x) + Math.PI;
  const adjustedTheta = (theta + Math.PI / 20) % (2 * Math.PI);
  const slice = Math.floor((adjustedTheta / (2 * Math.PI)) * 20);

  // Determine if this is an even (green/red) or odd (cream/red) segment
  const isEvenSegment = slice % 2 === 0;

  // Check if we're in double ring
  if (
    r >= dartboard.centerToOuterDouble - dartboard.doubleRingWidth &&
    r < dartboard.centerToOuterDouble
  ) {
    return isEvenSegment ? { r: 255, g: 0, b: 0 } : { r: 0, g: 128, b: 0 }; // Alternating red/green
  }

  // Check if we're in triple ring
  if (
    r >= dartboard.centerToOuterTriple - dartboard.tripleRingWidth &&
    r < dartboard.centerToOuterTriple
  ) {
    return isEvenSegment ? { r: 255, g: 0, b: 0 } : { r: 0, g: 128, b: 0 }; // Alternating red/green
  }

  // Regular segments (alternating green and cream)
  if (isEvenSegment) {
    return { r: 0, g: 128, b: 0 }; // Green
  } else {
    return { r: 255, g: 248, b: 220 }; // Cream
  }
}
