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

/** Get the score on a dartboard from normalised coordinates */
function getScore(x: number, y: number, dartboard: DartboardDef) {
  const r = Math.sqrt(x * x + y * y);
  if (r < dartboard.doubleBullDiameter) {
    return 50;
  }
  if (r < dartboard.bullDiameter) {
    return 25;
  }
  const theta = Math.atan2(y, x) + Math.PI;
  const adjustedTheta = (theta + Math.PI / 20) % (2 * Math.PI);
  const slice = (adjustedTheta / (2 * Math.PI)) * 20;
  const sliceIdx = Math.floor(slice);
  const sliceScore = dartboard.radialScores[sliceIdx];

  if (r < dartboard.centerToOuterDouble - dartboard.doubleRingWidth) {
    return sliceScore;
  }
  if (r < dartboard.centerToOuterDouble) {
    return sliceScore * 2;
  }
  if (r < dartboard.centerToOuterTriple - dartboard.tripleRingWidth) {
    return sliceScore;
  }
  if (r < dartboard.centerToOuterTriple) {
    return sliceScore * 3;
  }
  return 0;
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
