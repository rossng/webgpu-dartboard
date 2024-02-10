struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) intensity: f32,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Calculate the x and y positions based on vertexIndex to spread across 800x600 resolution
  var output: VertexOutput;
  let x = (f32(vertexIndex % 800u + 1u) / 800.0) * 2.0 - 1.0;
  let y = (f32(vertexIndex / 800u)) / 600.0 * 2.0 - 1.0;

  output.position = vec4<f32>(x, y, 0.0, 1.0);
  output.intensity = x;
  return output; // Note: y is inverted if the coordinate system requires
}