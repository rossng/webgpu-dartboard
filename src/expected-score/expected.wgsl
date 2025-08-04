@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: vec4f; // x: width, y: height, z: sigmaX, w: sigmaY
@group(0) @binding(2) var<storage, read> dartboard: array<u32>;

const WORKGROUP_SIZE: u32 = 64;

@compute @workgroup_size(WORKGROUP_SIZE) fn computeSomething(
  @builtin(workgroup_id) workgroup_id: vec3<u32>,
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(num_workgroups) num_workgroups: vec3<u32>,
  @builtin(local_invocation_index) local_invocation_index: u32,
) {
  let length = arrayLength(&data);
  let total_num_workgroups = num_workgroups.x * num_workgroups.y * num_workgroups.z;
  let count = length / (WORKGROUP_SIZE * total_num_workgroups);
  let ignore = u32(params.x);

  let workgroup_index =  
    workgroup_id.x +
    workgroup_id.y * num_workgroups.x +
    workgroup_id.z * num_workgroups.x * num_workgroups.y;

  let global_invocation_index =
     workgroup_index * WORKGROUP_SIZE +
     local_invocation_index;

  let start = global_invocation_index * count;
  let end = min(start + count, length);

  for (var i: u32 = start; i < end; i = i + 1) {
    let edge_length = u32(sqrt(f32(length)));
    let x = i % edge_length;
    let y = i / edge_length;


    var total_probability: f32 = 0.0;
    var total_score: f32 = 0.0;

    for (var j: u32 = 0; j < edge_length; j = j + 1) {
      for (var k: u32 = 0; k < edge_length; k = k + 1) {
        let gaussian = gaussian2D(f32(k), f32(j), f32(x), f32(y), params.z, params.w);
        // let gaussian = gaussian2D(f32(x), f32(y), f32(j), f32(k), 100, 100);
        let score = f32(dartboard[j * edge_length + k]);
        total_probability = total_probability + gaussian;
        total_score = total_score + gaussian * score;
        // data[j * edge_length + k] = gaussian * score;
      }
    }

    // data[i] = f32(total_score); // f32(i); // total_score / total_probability;
    // data[i] = f32(i);
    data[i] = select(total_score / total_probability, 0.0, total_probability == 0.0);
  }
}

fn gaussian2D(x: f32, y: f32, mu_x: f32, mu_y: f32, sigma_x: f32, sigma_y: f32) -> f32 {
  let coef: f32 = 1.0 / (2.0 * 3.14159265 * sigma_x * sigma_y);
  let exp_part: f32 = exp(-((x - mu_x) * (x - mu_x) / (2.0 * sigma_x * sigma_x) + (y - mu_y) * (y - mu_y) / (2.0 * sigma_y * sigma_y)));
  return coef * exp_part;
}

