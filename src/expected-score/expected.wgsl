@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: vec4f; // x: width, y: height, z: sigmaX, w: sigmaY
@group(0) @binding(2) var<storage, read> dartboard: array<u32>;

const WORKGROUP_SIZE_X: u32 = 16;
const WORKGROUP_SIZE_Y: u32 = 16;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y) fn computeSomething(
  @builtin(global_invocation_id) global_id: vec3<u32>,
) {
  let width = u32(params.x);
  let height = u32(params.y);
  let sigma_x = params.z;
  let sigma_y = params.w;
  
  let pixel_x = global_id.x;
  let pixel_y = global_id.y;
  
  // Early exit if out of bounds
  if (pixel_x >= width || pixel_y >= height) {
    return;
  }
  
  let pixel_index = pixel_y * width + pixel_x;
  let center_x = f32(pixel_x);
  let center_y = f32(pixel_y);
  
  var total_probability: f32 = 0.0;
  var total_score: f32 = 0.0;
  
  // Iterate through all dartboard positions
  for (var hit_y: u32 = 0; hit_y < height; hit_y++) {
    for (var hit_x: u32 = 0; hit_x < width; hit_x++) {
      // Calculate Gaussian probability
      let gaussian = gaussian2D(f32(hit_x), f32(hit_y), center_x, center_y, sigma_x, sigma_y);
      
      // Get dartboard score at this position
      let dartboard_index = hit_y * width + hit_x;
      let score = f32(dartboard[dartboard_index]);
      
      total_probability += gaussian;
      total_score += gaussian * score;
    }
  }
  
  // Write result
  data[pixel_index] = select(total_score / total_probability, 0.0, total_probability == 0.0);
}

fn gaussian2D(x: f32, y: f32, mu_x: f32, mu_y: f32, sigma_x: f32, sigma_y: f32) -> f32 {
  let coef: f32 = 1.0 / (2.0 * 3.14159265 * sigma_x * sigma_y);
  let exp_part: f32 = exp(-((x - mu_x) * (x - mu_x) / (2.0 * sigma_x * sigma_x) + (y - mu_y) * (y - mu_y) / (2.0 * sigma_y * sigma_y)));
  return coef * exp_part;
}

