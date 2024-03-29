@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> dims: vec2u;
@group(0) @binding(2) var<storage, read> dartboard: array<u32>;

@compute @workgroup_size(1) fn computeSomething(
  @builtin(global_invocation_id) id: vec3<u32>,
) {
  let gaussian = gaussian2D(f32(id.x), f32(id.y), f32(dims.x) / 2.0, f32(dims.y) / 2.0, 100, 100);
  let score = f32(dartboard[id.y * dims.x + id.x]);
  data[id.y * dims.x + id.x] = gaussian * score;
}

fn gaussian2D(x: f32, y: f32, mu_x: f32, mu_y: f32, sigma_x: f32, sigma_y: f32) -> f32 {
  let coef: f32 = 1.0 / (2.0 * 3.14159265 * sigma_x * sigma_y);
  let exp_part: f32 = exp(-((x - mu_x) * (x - mu_x) / (2.0 * sigma_x * sigma_x) + (y - mu_y) * (y - mu_y) / (2.0 * sigma_y * sigma_y)));
  return coef * exp_part;
}

