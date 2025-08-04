@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: vec4f; // x: width, y: height, z: areaType, w: scoreValue

// Dartboard configuration (normalized coordinates)
const DOUBLE_BULL_DIAMETER: f32 = 0.056372549;
const BULL_DIAMETER: f32 = 0.141815638;
const TRIPLE_RING_WIDTH: f32 = 0.035477308;  // Inner ring (closer to center)
const DOUBLE_RING_WIDTH: f32 = 0.035477308;  // Outer ring (farther from center)
const CENTER_TO_OUTER_TRIPLE: f32 = 0.474501108;  // Triple is inner ring
const CENTER_TO_OUTER_DOUBLE: f32 = 0.753881279;  // Double is outer ring

// Function to get radial score by index (20 segments starting from rightmost, going clockwise)
fn getRadialScore(index: i32) -> i32 {
  if (index == 0) { return 6; }
  if (index == 1) { return 13; }
  if (index == 2) { return 4; }
  if (index == 3) { return 18; }
  if (index == 4) { return 1; }
  if (index == 5) { return 20; }
  if (index == 6) { return 5; }
  if (index == 7) { return 12; }
  if (index == 8) { return 9; }
  if (index == 9) { return 14; }
  if (index == 10) { return 11; }
  if (index == 11) { return 8; }
  if (index == 12) { return 16; }
  if (index == 13) { return 7; }
  if (index == 14) { return 19; }
  if (index == 15) { return 3; }
  if (index == 16) { return 17; }
  if (index == 17) { return 2; }
  if (index == 18) { return 15; }
  if (index == 19) { return 10; }
  return 0;
}

@compute @workgroup_size(1) fn computeScoreAreas(
  @builtin(global_invocation_id) id: vec3<u32>,
) {
  // Convert pixel coordinates to normalized coordinates (-1 to 1)
  let x = (f32(id.x) / params.x) * 2.0 - 1.0;
  let y = (f32(id.y) / params.y) * 2.0 - 1.0;
  
  let areaType = i32(params.z);
  let scoreValue = i32(params.w);
  
  let isInSelectedArea = isPointInArea(x, y, areaType, scoreValue);
  
  data[id.y * u32(params.x) + id.x] = select(0.0, 1.0, isInSelectedArea);
}

fn isPointInArea(x: f32, y: f32, areaType: i32, scoreValue: i32) -> bool {
  let r = sqrt(x * x + y * y);
  
  // Area type: 0=none, 1=bull, 2=outer-bull, 3=single, 4=double, 5=triple
  if (areaType == 0) { // none - show full dartboard
    return true;
  } else if (areaType == 1) { // bull (50)
    return r < DOUBLE_BULL_DIAMETER;
  } else if (areaType == 2) { // outer bull (25)
    return r >= DOUBLE_BULL_DIAMETER && r < BULL_DIAMETER;
  } else if (areaType == 3) { // single score
    return isInSingleArea(x, y, r, scoreValue);
  } else if (areaType == 4) { // double score
    return isInDoubleArea(x, y, r, scoreValue);
  } else if (areaType == 5) { // triple score
    return isInTripleArea(x, y, r, scoreValue);
  } else {
    return false;
  }
}

fn isInSingleArea(x: f32, y: f32, r: f32, scoreValue: i32) -> bool {
  if (r < BULL_DIAMETER) {
    return false; // Inside bull area
  }
  
  let sliceIdx = getSliceIndex(x, y);
  if (getRadialScore(sliceIdx) != scoreValue) {
    return false; // Wrong score slice
  }
  
  // Single area: two regions only
  // 1. Between bull and triple ring (inner ring)
  let innerTripleRadius = CENTER_TO_OUTER_TRIPLE - TRIPLE_RING_WIDTH;
  let betweenBullAndTriple = r >= BULL_DIAMETER && r < innerTripleRadius;
  
  // 2. Between triple ring (inner) and double ring (outer)
  let innerDoubleRadius = CENTER_TO_OUTER_DOUBLE - DOUBLE_RING_WIDTH;
  let betweenTripleAndDouble = r > CENTER_TO_OUTER_TRIPLE && r < innerDoubleRadius;
  
  return betweenBullAndTriple || betweenTripleAndDouble;
}

fn isInDoubleArea(x: f32, y: f32, r: f32, scoreValue: i32) -> bool {
  let sliceIdx = getSliceIndex(x, y);
  if (getRadialScore(sliceIdx) != scoreValue) {
    return false; // Wrong score slice
  }
  
  // Double ring area (outer ring - farther from center)
  let innerDoubleRadius = CENTER_TO_OUTER_DOUBLE - DOUBLE_RING_WIDTH;
  return r >= innerDoubleRadius && r <= CENTER_TO_OUTER_DOUBLE;
}

fn isInTripleArea(x: f32, y: f32, r: f32, scoreValue: i32) -> bool {
  let sliceIdx = getSliceIndex(x, y);
  if (getRadialScore(sliceIdx) != scoreValue) {
    return false; // Wrong score slice
  }
  
  // Triple ring area (inner ring - closer to center)
  let innerTripleRadius = CENTER_TO_OUTER_TRIPLE - TRIPLE_RING_WIDTH;
  return r >= innerTripleRadius && r <= CENTER_TO_OUTER_TRIPLE;
}

fn getSliceIndex(x: f32, y: f32) -> i32 {
  // Flip across y-axis by negating x
  let theta = atan2(y, -x) + 3.14159265;
  let adjustedTheta = (theta + 3.14159265 / 20.0) % (2.0 * 3.14159265);
  let slice = (adjustedTheta / (2.0 * 3.14159265)) * 20.0;
  return i32(floor(slice));
}