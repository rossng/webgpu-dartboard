// Radial scores in clockwise order starting from the rightmost position (3 o'clock)
const RADIAL_SCORES = [6, 13, 4, 18, 1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10];

/**
 * Draws the radial segment scores around the outside of a dartboard
 * @param ctx - Canvas 2D context
 * @param centerX - X coordinate of dartboard center
 * @param centerY - Y coordinate of dartboard center
 * @param radius - Radius at which to draw the numbers (should be outside the dartboard)
 * @param fontSize - Font size for the numbers
 * @param color - Color for the text
 */
export function drawRadialScores(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  fontSize: number = 16,
  color: string = '#333'
): void {
  ctx.save();
  
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw each number around the circle
  for (let i = 0; i < RADIAL_SCORES.length; i++) {
    const score = RADIAL_SCORES[i];
    
    // Calculate angle for this segment
    // 20 is at index 5 in our array, so we need to rotate by 5 positions
    // to put 20 at the top (-π/2 radians)
    // Each segment is 2π/20 radians = π/10 radians = 18 degrees
    // Negate the angle to flip horizontally (11 should be on left, not right)
    const angle = -Math.PI / 2 - ((i - 5) * Math.PI) / 10;
    
    // Calculate position for the number
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    
    // Draw the number
    ctx.fillText(score.toString(), x, y);
  }
  
  ctx.restore();
}

/**
 * Gets the radial score for a given segment index
 * @param segmentIndex - Index from 0-19 starting from rightmost going clockwise
 * @returns The score value for that segment
 */
export function getRadialScore(segmentIndex: number): number {
  return RADIAL_SCORES[segmentIndex % RADIAL_SCORES.length];
}

/**
 * Gets all radial scores in order
 * @returns Array of all 20 radial scores
 */
export function getAllRadialScores(): number[] {
  return [...RADIAL_SCORES];
}

/**
 * Draws subtle segment boundary lines on the dartboard
 * @param ctx - Canvas 2D context
 * @param centerX - X coordinate of dartboard center
 * @param centerY - Y coordinate of dartboard center
 * @param canvasSize - Size of the canvas (width/height)
 * @param alpha - Opacity of the boundary lines (0-1)
 */
export function drawSegmentBoundaries(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  canvasSize: number,
  alpha: number = 0.3
): void {
  ctx.save();
  
  // Set line style for boundaries
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 1;
  
  // Draw radial segment boundaries (20 segments)
  for (let i = 0; i < 20; i++) {
    // Calculate angle for each segment boundary
    // Each segment is 2π/20 radians = π/10 radians = 18 degrees
    const angle = (i * Math.PI) / 10;
    
    // Draw line from outer bull to outer edge (not from center)
    const innerRadius = 0.107 * (canvasSize / 2); // Start from outer bull edge
    const outerRadius = 0.754 * (canvasSize / 2); // End at dartboard edge
    
    const startX = centerX + Math.cos(angle) * innerRadius;
    const startY = centerY + Math.sin(angle) * innerRadius;
    const endX = centerX + Math.cos(angle) * outerRadius;
    const endY = centerY + Math.sin(angle) * outerRadius;
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  
  // Draw concentric circles for scoring regions
  // Based on standard dartboard proportions (normalized to -1 to 1 range)
  const regions = [
    { radius: 0.063, name: 'inner-bull' },      // Inner bull (50 points)
    { radius: 0.107, name: 'outer-bull' },      // Outer bull (25 points)  
    { radius: 0.540, name: 'triple-inner' },    // Inner edge of triple ring
    { radius: 0.580, name: 'triple-outer' },    // Outer edge of triple ring
    { radius: 0.714, name: 'double-inner' },    // Inner edge of double ring
    { radius: 0.754, name: 'double-outer' },    // Outer edge of double ring (dartboard edge)
  ];
  
  ctx.lineWidth = 0.5;
  
  for (const region of regions) {
    const pixelRadius = region.radius * (canvasSize / 2);
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, pixelRadius, 0, 2 * Math.PI);
    ctx.stroke();
  }
  
  ctx.restore();
}