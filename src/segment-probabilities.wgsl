@group(0) @binding(0) var<storage, read_write> hitData: array<f32>;
@group(0) @binding(1) var<uniform> params: vec4f; // x: width, y: height, z: targetX, w: targetY
@group(0) @binding(2) var<storage, read_write> segmentSums: array<atomic<u32>>; // Array to store sums for each segment

// Dartboard configuration (normalized coordinates)
const DOUBLE_BULL_DIAMETER: f32 = 0.056372549;
const BULL_DIAMETER: f32 = 0.141815638;
const TRIPLE_RING_WIDTH: f32 = 0.035477308;
const DOUBLE_RING_WIDTH: f32 = 0.035477308;
const CENTER_TO_OUTER_TRIPLE: f32 = 0.474501108;
const CENTER_TO_OUTER_DOUBLE: f32 = 0.753881279;

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

@compute @workgroup_size(1) fn computeSegmentProbabilities(
  @builtin(global_invocation_id) id: vec3<u32>,
) {
  // Convert target from normalized coords (-1 to 1) to pixel coords
  let targetPixelX = (params.z + 1.0) * params.x * 0.5;
  let targetPixelY = (params.w + 1.0) * params.y * 0.5;
  
  // Calculate gaussian hit probability at this pixel
  let gaussian = gaussian2D(f32(id.x), f32(id.y), targetPixelX, targetPixelY, 100, 100);
  
  // Store the gaussian value in hitData for rendering
  hitData[id.y * u32(params.x) + id.x] = gaussian;
  
  // Convert pixel coordinates to normalized coordinates (-1 to 1)
  let x = (f32(id.x) / params.x) * 2.0 - 1.0;
  let y = (f32(id.y) / params.y) * 2.0 - 1.0;
  
  // Determine which segment this pixel belongs to
  let segmentId = getSegmentId(x, y);
  
  // Add this pixel's probability to the appropriate segment sum
  // Convert float to fixed-point integer for atomic operations (multiply by 1000000 for precision)
  if (segmentId >= 0) {
    let gaussianFixed = u32(gaussian * 1000000.0);
    atomicAdd(&segmentSums[segmentId], gaussianFixed);
  }
}

fn getSegmentId(x: f32, y: f32) -> i32 {
  let r = sqrt(x * x + y * y);
  
  // Outside dartboard
  if (r > 1.0) {
    return 62; // Miss (outside dartboard)
  }
  
  // Bull (50 points)
  if (r < DOUBLE_BULL_DIAMETER) {
    return 61; // Bull
  }
  
  // Outer bull (25 points)
  if (r < BULL_DIAMETER) {
    return 60; // Outer bull
  }
  
  // Get slice index (0-19)
  let sliceIdx = getSliceIndex(x, y);
  let baseScore = getRadialScore(sliceIdx);
  
  // Determine ring type and calculate segment ID
  let innerTripleRadius = CENTER_TO_OUTER_TRIPLE - TRIPLE_RING_WIDTH;
  let innerDoubleRadius = CENTER_TO_OUTER_DOUBLE - DOUBLE_RING_WIDTH;
  
  if (r < innerTripleRadius) {
    // Inner single area
    return sliceIdx; // 0-19: Single scores
  } else if (r <= CENTER_TO_OUTER_TRIPLE) {
    // Triple ring
    return 20 + sliceIdx; // 20-39: Triple scores
  } else if (r < innerDoubleRadius) {
    // Outer single area
    return sliceIdx; // 0-19: Single scores (same as inner)
  } else if (r <= CENTER_TO_OUTER_DOUBLE) {
    // Double ring
    return 40 + sliceIdx; // 40-59: Double scores
  } else {
    // Outside double ring but inside dartboard - should not happen with proper dartboard
    return 62; // Miss
  }
}

fn getSliceIndex(x: f32, y: f32) -> i32 {
  let theta = atan2(y, x) + 3.14159265;
  let adjustedTheta = (theta + 3.14159265 / 20.0) % (2.0 * 3.14159265);
  let slice = (adjustedTheta / (2.0 * 3.14159265)) * 20.0;
  return i32(floor(slice));
}

fn gaussian2D(x: f32, y: f32, mu_x: f32, mu_y: f32, sigma_x: f32, sigma_y: f32) -> f32 {
  let coef: f32 = 1.0 / (2.0 * 3.14159265 * sigma_x * sigma_y);
  let exp_part: f32 = exp(-((x - mu_x) * (x - mu_x) / (2.0 * sigma_x * sigma_x) + (y - mu_y) * (y - mu_y) / (2.0 * sigma_y * sigma_y)));
  return coef * exp_part;
}