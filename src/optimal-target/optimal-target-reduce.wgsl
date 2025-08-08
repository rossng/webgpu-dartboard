@group(0) @binding(0) var<storage, read_write> workgroup_results: array<vec3f>; // x, y, score for each workgroup
@group(0) @binding(1) var<uniform> params: vec4f; // x: width, y: height, z: sigma, w: num_workgroups

// Second pass to find the global maximum across all workgroups
@compute @workgroup_size(1) fn findGlobalOptimum() {
  let num_workgroups = u32(params.w);
  
  var global_max_score: f32 = 0.0;
  var global_optimal_position = vec2f(0.0, 0.0);
  
  for (var i: u32 = 0; i < num_workgroups; i = i + 1) {
    let result = workgroup_results[i];
    let score = result.z;
    
    if (score > global_max_score) {
      global_max_score = score;
      global_optimal_position = vec2f(result.x, result.y);
    }
  }
  
  // Store the final result in the first element of workgroup_results
  workgroup_results[0] = vec3f(global_optimal_position.x, global_optimal_position.y, global_max_score);
}