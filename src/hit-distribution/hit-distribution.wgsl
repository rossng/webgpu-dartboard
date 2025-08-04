@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: vec4f; // x: width, y: height, z: targetX, w: targetY

@compute @workgroup_size(1) fn computeHitDistribution(
  @builtin(global_invocation_id) id: vec3<u32>,
) {
  // Convert target from normalized coords (-1 to 1) to pixel coords
  let targetPixelX = (params.z + 1.0) * params.x * 0.5;
  let targetPixelY = (params.w + 1.0) * params.y * 0.5;
  
  let gaussian = gaussian2D(f32(id.x), f32(id.y), targetPixelX, targetPixelY, 100, 100);
  data[id.y * u32(params.x) + id.x] = gaussian;
}

fn gaussian2D(x: f32, y: f32, mu_x: f32, mu_y: f32, sigma_x: f32, sigma_y: f32) -> f32 {
  let coef: f32 = 1.0 / (2.0 * 3.14159265 * sigma_x * sigma_y);
  let exp_part: f32 = exp(-((x - mu_x) * (x - mu_x) / (2.0 * sigma_x * sigma_x) + (y - mu_y) * (y - mu_y) / (2.0 * sigma_y * sigma_y)));
  return coef * exp_part;
}