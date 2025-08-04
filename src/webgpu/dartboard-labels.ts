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