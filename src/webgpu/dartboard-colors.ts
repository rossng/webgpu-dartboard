interface DartboardDef {
  wholeBoardDiameter: number;
  doubleBullDiameter: number;
  bullDiameter: number;
  tripleRingWidth: number;
  doubleRingWidth: number;
  centerToOuterDouble: number;
  centerToOuterTriple: number;
  radialScores: number[];
}

const REGULATION_BOARD = {
  wholeBoardDiameter: 451,
  doubleBullDiameter: 12.7,
  bullDiameter: 32,
  tripleRingWidth: 8,
  doubleRingWidth: 8,
  centerToOuterDouble: 107,
  centerToOuterTriple: 170,
  radialScores: [6, 13, 4, 18, 1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10],
};

function normaliseDartboard(dartboard: DartboardDef) {
  return {
    wholeBoardDiameter: 2,
    doubleBullDiameter: (dartboard.doubleBullDiameter / dartboard.wholeBoardDiameter) * 2,
    bullDiameter: (dartboard.bullDiameter / dartboard.wholeBoardDiameter) * 2,
    tripleRingWidth: (dartboard.tripleRingWidth / dartboard.wholeBoardDiameter) * 2,
    doubleRingWidth: (dartboard.doubleRingWidth / dartboard.wholeBoardDiameter) * 2,
    centerToOuterDouble: (dartboard.centerToOuterDouble / dartboard.wholeBoardDiameter) * 2,
    centerToOuterTriple: (dartboard.centerToOuterTriple / dartboard.wholeBoardDiameter) * 2,
    radialScores: [...dartboard.radialScores],
  };
}

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
  if (r < dartboard.doubleBullDiameter) {
    return { r: 255, g: 0, b: 0 }; // Red
  }
  
  // Bull (green)
  if (r < dartboard.bullDiameter) {
    return { r: 0, g: 128, b: 0 }; // Green
  }
  
  // Outside dartboard
  if (r > dartboard.centerToOuterTriple) {
    return { r: 0, g: 0, b: 0 }; // Black
  }
  
  const theta = Math.atan2(y, x) + Math.PI;
  const adjustedTheta = (theta + Math.PI / 20) % (2 * Math.PI);
  const slice = Math.floor((adjustedTheta / (2 * Math.PI)) * 20);
  
  // Determine if this is an even (green/red) or odd (cream/red) segment
  const isEvenSegment = slice % 2 === 0;
  
  // Check if we're in double ring
  if (r >= dartboard.centerToOuterDouble - dartboard.doubleRingWidth && r < dartboard.centerToOuterDouble) {
    return isEvenSegment ? { r: 255, g: 0, b: 0 } : { r: 0, g: 128, b: 0 }; // Alternating red/green
  }
  
  // Check if we're in triple ring  
  if (r >= dartboard.centerToOuterTriple - dartboard.tripleRingWidth && r < dartboard.centerToOuterTriple) {
    return isEvenSegment ? { r: 255, g: 0, b: 0 } : { r: 0, g: 128, b: 0 }; // Alternating red/green
  }
  
  // Regular segments (alternating green and cream)
  if (isEvenSegment) {
    return { r: 0, g: 128, b: 0 }; // Green
  } else {
    return { r: 255, g: 248, b: 220 }; // Cream
  }
}