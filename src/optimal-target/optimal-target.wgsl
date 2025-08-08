@group(0) @binding(0) var<storage, read_write> workgroup_results: array<vec3f>; // x, y, score for each workgroup
@group(0) @binding(1) var<storage, read> dartboard: array<u32>;
@group(0) @binding(2) var<uniform> params: vec4f; // x: width, y: height, z: sigma, w: num_workgroups

const WORKGROUP_SIZE: u32 = 64;
var<workgroup> shared_scores: array<f32, WORKGROUP_SIZE>;
var<workgroup> shared_positions: array<vec2f, WORKGROUP_SIZE>;

@compute @workgroup_size(WORKGROUP_SIZE) fn findOptimalPosition(
  @builtin(workgroup_id) workgroup_id: vec3<u32>,
  @builtin(local_invocation_index) local_index: u32,
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
  let width = u32(params.x);
  let height = u32(params.y);
  let sigma = params.z;
  let total_positions = width * height;
  
  // Calculate how many positions this workgroup should handle
  let total_workgroups = num_workgroups.x * num_workgroups.y * num_workgroups.z;
  let positions_per_workgroup = (total_positions + total_workgroups - 1) / total_workgroups;
  let workgroup_index = workgroup_id.x + workgroup_id.y * num_workgroups.x + workgroup_id.z * num_workgroups.x * num_workgroups.y;
  let workgroup_start = workgroup_index * positions_per_workgroup;
  let workgroup_end = min(workgroup_start + positions_per_workgroup, total_positions);
  
  // Each thread in the workgroup handles a subset of positions
  let positions_per_thread = (positions_per_workgroup + WORKGROUP_SIZE - 1) / WORKGROUP_SIZE;
  let thread_start = workgroup_start + local_index * positions_per_thread;
  let thread_end = min(thread_start + positions_per_thread, workgroup_end);
  
  var max_expected_score: f32 = 0.0;
  var optimal_x: f32 = 0.0;
  var optimal_y: f32 = 0.0;
  
  // Each thread searches its assigned positions
  for (var pos: u32 = thread_start; pos < thread_end; pos = pos + 1) {
    let x = pos % width;
    let y = pos / width;
    let expected_score = computeExpectedScoreAtPosition(f32(x), f32(y), sigma, width, height);
    
    if (expected_score > max_expected_score) {
      max_expected_score = expected_score;
      optimal_x = f32(x);
      optimal_y = f32(y);
    }
  }
  
  // Store this thread's best result in shared memory
  shared_scores[local_index] = max_expected_score;
  shared_positions[local_index] = vec2f(optimal_x, optimal_y);
  
  // Synchronize workgroup threads
  workgroupBarrier();
  
  // Perform parallel reduction to find the best result across the workgroup
  // Only thread 0 performs the reduction
  if (local_index == 0) {
    var workgroup_max_score = shared_scores[0];
    var workgroup_optimal_position = shared_positions[0];
    
    for (var i: u32 = 1; i < WORKGROUP_SIZE; i = i + 1) {
      if (shared_scores[i] > workgroup_max_score) {
        workgroup_max_score = shared_scores[i];
        workgroup_optimal_position = shared_positions[i];
      }
    }
    
    // Store this workgroup's result for later reduction
    workgroup_results[workgroup_index] = vec3f(workgroup_optimal_position.x, workgroup_optimal_position.y, workgroup_max_score);
  }
}


fn computeExpectedScoreAtPosition(target_x: f32, target_y: f32, sigma: f32, width: u32, height: u32) -> f32 {
  var total_probability: f32 = 0.0;
  var total_score: f32 = 0.0;
  
  // Sample the Gaussian distribution around the target position
  for (var y: u32 = 0; y < height; y = y + 1) {
    for (var x: u32 = 0; x < width; x = x + 1) {
      let gaussian = gaussian2D(f32(x), f32(y), target_x, target_y, sigma, sigma);
      let score = f32(dartboard[y * width + x]);
      
      total_probability = total_probability + gaussian;
      total_score = total_score + gaussian * score;
    }
  }
  
  return select(total_score / total_probability, 0.0, total_probability == 0.0);
}

fn gaussian2D(x: f32, y: f32, mu_x: f32, mu_y: f32, sigma_x: f32, sigma_y: f32) -> f32 {
  let coef: f32 = 1.0 / (2.0 * 3.14159265 * sigma_x * sigma_y);
  let exp_part: f32 = exp(-((x - mu_x) * (x - mu_x) / (2.0 * sigma_x * sigma_x) + (y - mu_y) * (y - mu_y) / (2.0 * sigma_y * sigma_y)));
  return coef * exp_part;
}