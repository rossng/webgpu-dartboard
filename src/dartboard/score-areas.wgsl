@group(0) @binding(0) var<uniform> params: vec4f; // x: width, y: height, z: segmentIndex, w: unused

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Dartboard configuration (normalized coordinates) - calculated from REGULATION_BOARD
// All values are (measurement_in_mm / wholeBoardDiameter_451mm) * 2
const DOUBLE_BULL_DIAMETER: f32 = 0.056372549;  // (12.7 / 451) * 2
const BULL_DIAMETER: f32 = 0.141815638;         // (32 / 451) * 2
const TRIPLE_RING_WIDTH: f32 = 0.035477308;     // (8 / 451) * 2
const DOUBLE_RING_WIDTH: f32 = 0.035477308;     // (8 / 451) * 2
const CENTER_TO_OUTER_TRIPLE: f32 = 0.474501108; // (107 / 451) * 2
const CENTER_TO_OUTER_DOUBLE: f32 = 0.753881279; // (170 / 451) * 2

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

@vertex fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Create full-screen quad
  let pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0)
  );
  
  let uv = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
  );
  
  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  return output;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  // Convert UV coordinates to normalized coordinates (-1 to 1)
  let x = input.uv.x * 2.0 - 1.0;
  let y = (1.0 - input.uv.y) * 2.0 - 1.0; // Flip Y for correct orientation
  
  let selectedSegmentIndex = i32(params.z);
  
  let currentSegmentIndex = getSegmentIndex(x, y);
  let isInSelectedArea = (selectedSegmentIndex == -1) || (currentSegmentIndex == selectedSegmentIndex);
  let baseColor = getDartboardColor(x, y);
  
  // Apply highlighting/dimming
  var finalColor: vec3f;
  if (isInSelectedArea) {
    // Brighten selected area
    finalColor = vec3f(
      min(1.0, baseColor.r * 1.5),
      min(1.0, baseColor.g * 1.5), 
      min(1.0, baseColor.b * 1.5)
    );
  } else {
    // Dim non-selected areas
    finalColor = baseColor * 0.3;
  }
  
  return vec4f(finalColor, 1.0);
}

// Get segment index (0-62) for a point, matching utils.ts logic
// 0-19=singles, 20-39=triples, 40-59=doubles, 60=outer bull, 61=bull, 62=miss
fn getSegmentIndex(x: f32, y: f32) -> i32 {
  let r = sqrt(x * x + y * y);
  
  // Bull (50 points)
  if (r < DOUBLE_BULL_DIAMETER / 2.0) {
    return 61;
  }
  
  // Outer Bull (25 points) 
  if (r < BULL_DIAMETER / 2.0) {
    return 60;
  }
  
  // Miss (outside dartboard)
  if (r > CENTER_TO_OUTER_DOUBLE) {
    return 62;
  }
  
  // Get slice index (0-19)
  let sliceIdx = getSliceIndex(x, y);
  
  // Determine ring type based on radius
  let innerTripleRadius = CENTER_TO_OUTER_TRIPLE - TRIPLE_RING_WIDTH;
  let innerDoubleRadius = CENTER_TO_OUTER_DOUBLE - DOUBLE_RING_WIDTH;
  
  if (r >= innerTripleRadius && r < CENTER_TO_OUTER_TRIPLE) {
    // Triple ring (20-39)
    return sliceIdx + 20;
  } else if (r >= innerDoubleRadius && r < CENTER_TO_OUTER_DOUBLE) {
    // Double ring (40-59)
    return sliceIdx + 40;
  } else {
    // Single area (0-19)
    return sliceIdx;
  }
}

fn getSliceIndex(x: f32, y: f32) -> i32 {
  // Flip across y-axis by negating x
  let theta = atan2(y, -x) + 3.14159265;
  let adjustedTheta = (theta + 3.14159265 / 20.0) % (2.0 * 3.14159265);
  let slice = (adjustedTheta / (2.0 * 3.14159265)) * 20.0;
  return i32(floor(slice));
}

fn getDartboardColor(x: f32, y: f32) -> vec3f {
  let r = sqrt(x * x + y * y);
  
  // Double bull (red center)
  if (r < DOUBLE_BULL_DIAMETER / 2.0) {
    return vec3f(1.0, 0.0, 0.0); // Red
  }
  
  // Bull (green)
  if (r < BULL_DIAMETER / 2.0) {
    return vec3f(0.0, 0.502, 0.0); // Green (128/255)
  }
  
  // Outside dartboard
  if (r > CENTER_TO_OUTER_DOUBLE) {
    return vec3f(0.0, 0.0, 0.0); // Black
  }
  
  // Get slice index for alternating colors
  let theta = atan2(y, x) + 3.14159265;
  let adjustedTheta = (theta + 3.14159265 / 20.0) % (2.0 * 3.14159265);
  let slice = i32(floor((adjustedTheta / (2.0 * 3.14159265)) * 20.0));
  let isEvenSegment = (slice % 2) == 0;
  
  // Check if we're in double ring
  if (r >= (CENTER_TO_OUTER_DOUBLE - DOUBLE_RING_WIDTH) && r < CENTER_TO_OUTER_DOUBLE) {
    if (isEvenSegment) {
      return vec3f(1.0, 0.0, 0.0); // Red
    } else {
      return vec3f(0.0, 0.502, 0.0); // Green
    }
  }
  
  // Check if we're in triple ring
  if (r >= (CENTER_TO_OUTER_TRIPLE - TRIPLE_RING_WIDTH) && r < CENTER_TO_OUTER_TRIPLE) {
    if (isEvenSegment) {
      return vec3f(1.0, 0.0, 0.0); // Red
    } else {
      return vec3f(0.0, 0.502, 0.0); // Green
    }
  }
  
  // Regular segments (alternating green and cream)
  if (isEvenSegment) {
    return vec3f(0.0, 0.502, 0.0); // Green
  } else {
    return vec3f(1.0, 0.973, 0.863); // Cream (255/255, 248/255, 220/255)
  }
}