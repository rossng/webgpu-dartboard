interface DartboardDef {
  wholeBoardDiameter: number;
  doubleBullDiameter: number;
  bullDiameter: number;
  tripleRingWidth: number;
  doubleRingWidth: number;
  /** Radius of the outer edge of the triple (inner) ring */
  centerToOuterTriple: number;
  /** Radius of the outer edge of the double (outer) ring */
  centerToOuterDouble: number;
  radialScores: number[];
}

// Measurements in mm
export const REGULATION_BOARD = {
  wholeBoardDiameter: 451,
  doubleBullDiameter: 12.7,
  bullDiameter: 32,
  tripleRingWidth: 8,
  doubleRingWidth: 8,
  centerToOuterTriple: 107,
  centerToOuterDouble: 170,
  radialScores: [6, 13, 4, 18, 1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10],
};

export function normaliseDartboard(dartboard: DartboardDef) {
  return {
    wholeBoardDiameter: 2,
    doubleBullDiameter: (dartboard.doubleBullDiameter / dartboard.wholeBoardDiameter) * 2,
    bullDiameter: (dartboard.bullDiameter / dartboard.wholeBoardDiameter) * 2,
    tripleRingWidth: (dartboard.tripleRingWidth / dartboard.wholeBoardDiameter) * 2,
    doubleRingWidth: (dartboard.doubleRingWidth / dartboard.wholeBoardDiameter) * 2,
    centerToOuterTriple: (dartboard.centerToOuterTriple / dartboard.wholeBoardDiameter) * 2,
    centerToOuterDouble: (dartboard.centerToOuterDouble / dartboard.wholeBoardDiameter) * 2,
    radialScores: [...dartboard.radialScores],
  };
}

/** Get the score on a dartboard from normalised coordinates */
function getScore(x: number, y: number, dartboard: DartboardDef) {
  const r = Math.sqrt(x * x + y * y);
  if (r < dartboard.doubleBullDiameter / 2) {
    return 50;
  }
  if (r < dartboard.bullDiameter / 2) {
    return 25;
  }
  const theta = Math.atan2(y, -x) + Math.PI;
  const adjustedTheta = (theta + Math.PI / 20) % (2 * Math.PI);
  const slice = (adjustedTheta / (2 * Math.PI)) * 20;
  const sliceIdx = Math.floor(slice);
  const sliceScore = dartboard.radialScores[sliceIdx];

  if (r < dartboard.centerToOuterTriple - dartboard.tripleRingWidth) {
    return sliceScore;
  }
  if (r < dartboard.centerToOuterTriple) {
    return sliceScore * 3;
  }
  if (r < dartboard.centerToOuterDouble - dartboard.doubleRingWidth) {
    return sliceScore;
  }
  if (r < dartboard.centerToOuterDouble) {
    return sliceScore * 2;
  }
  return 0;
}

/**
 * Convert pixels to millimeters based on dartboard dimensions and canvas size
 * @param pixels - Value in pixels
 * @param canvasWidth - Width of the canvas in pixels
 * @returns Value in millimeters
 */
export function pixelsToMm(pixels: number, canvasWidth: number): number {
  const normalizedDartboard = normaliseDartboard(REGULATION_BOARD);
  const centerToOuterDoubleNormalized = normalizedDartboard.centerToOuterDouble;
  const centerToOuterDoubleMm = REGULATION_BOARD.centerToOuterDouble;
  const pixelToMm = centerToOuterDoubleMm / (centerToOuterDoubleNormalized * (canvasWidth / 2));
  return pixels * pixelToMm;
}

/**
 * Convert millimeters to pixels based on dartboard dimensions and canvas size
 * @param mm - Value in millimeters
 * @param canvasWidth - Width of the canvas in pixels
 * @returns Value in pixels
 */
export function mmToPixels(mm: number, canvasWidth: number): number {
  const normalizedDartboard = normaliseDartboard(REGULATION_BOARD);
  const centerToOuterDoubleNormalized = normalizedDartboard.centerToOuterDouble;
  const centerToOuterDoubleMm = REGULATION_BOARD.centerToOuterDouble;
  const pixelToMm = centerToOuterDoubleMm / (centerToOuterDoubleNormalized * (canvasWidth / 2));
  const mmToPixel = 1 / pixelToMm;
  return mm * mmToPixel;
}

export function makeDartboard(width: number): Uint32Array {
  const dartboard = normaliseDartboard(REGULATION_BOARD);
  const arr = new Uint32Array(width * width);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const normX = (x / width) * 2 - 1;
      const normY = (y / width) * 2 - 1;
      arr[idx] = getScore(normX, normY, dartboard);
    }
  }

  return arr;
}
