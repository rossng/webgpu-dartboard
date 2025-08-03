@group(0) @binding(0) var<storage, read> data: array<f32>;

@vertex
fn vs(
    @location(0) vert: vec2f,
) -> @builtin(position) vec4<f32> {
    return vec4<f32>(vert, 0.0, 1.0);
}

@fragment
fn fs(
    @builtin(position) pos: vec4<f32>,
) -> @location(0) vec4<f32> {
    // Assume square texture in storage buffer
    let len = arrayLength(&data);
    let width = u32(sqrt(f32(len))); 

    // let x = u32((pos.x + 1.0) / 2.0 * f32(width));
    //let y = u32((pos.y + 1.0) / 2.0 * f32(width));

    let intensity = data[u32(pos.y * f32(width) + pos.x)];
    return vec4(intensity / 25, 0.0, 0.0, 1.0);
}