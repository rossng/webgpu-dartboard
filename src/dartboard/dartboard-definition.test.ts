import { describe, expect, test } from "vitest";
import { mmToPixels, pixelsToMm, REGULATION_BOARD } from "./dartboard-definition";

describe("Dartboard coordinate conversion", () => {
  const canvasSize = 500; // 500x500 canvas
  const center = canvasSize / 2; // 250, 250 is the center

  describe("pixelsToMm", () => {
    test("center of dartboard should be 0mm", () => {
      // At center (250, 250), distance from center is 0
      const distanceFromCenter = 0;
      const result = pixelsToMm(distanceFromCenter, canvasSize);
      expect(result).toBeCloseTo(0, 1);
    });

    test("outer double ring should be 170mm from center", () => {
      // The outer double ring is at centerToOuterDouble radius in real dartboard
      // In normalized coords, it's at centerToOuterDouble
      // We need to find how many pixels that is

      // From the normalization: the dartboard fits in a 2x2 normalized space
      // centerToOuterDouble normalized = REGULATION_BOARD.centerToOuterDouble/REGULATION_BOARD.wholeBoardDiameter * 2
      // In pixel space (500x500): normalized_value * 250 = pixels from center

      const pixelsFromCenter =
        (REGULATION_BOARD.centerToOuterDouble / REGULATION_BOARD.wholeBoardDiameter) *
        2 *
        (canvasSize / 2);
      const result = pixelsToMm(pixelsFromCenter, canvasSize);
      expect(result).toBeCloseTo(REGULATION_BOARD.centerToOuterDouble, 0.1);
    });

    test("edge of dartboard should be ~225.5mm from center", () => {
      // The dartboard diameter is REGULATION_BOARD.wholeBoardDiameter, so radius is half that
      // In pixel space, the edge is at 250 pixels from center (half the canvas)
      const pixelsFromCenter = canvasSize / 2;
      const result = pixelsToMm(pixelsFromCenter, canvasSize);
      expect(result).toBeCloseTo(REGULATION_BOARD.wholeBoardDiameter / 2, 0.5);
    });

    test("negative values should work (left/up from center)", () => {
      // 100 pixels left of center
      const pixelsFromCenter = -100;
      const result = pixelsToMm(pixelsFromCenter, canvasSize);
      expect(result).toBeLessThan(0);
      // Should be proportional
      expect(Math.abs(result)).toBeCloseTo(Math.abs(pixelsToMm(100, canvasSize)), 0.1);
    });

    test("point just above center should have small negative Y in mm", () => {
      // If we're 10 pixels above center (Y = 240 in canvas coords)
      // That's -10 pixels from center in Y
      const pixelsFromCenterY = -10;
      const result = pixelsToMm(pixelsFromCenterY, canvasSize);
      expect(result).toBeLessThan(0);
      expect(Math.abs(result)).toBeLessThan(20); // Should be a small value in mm
    });
  });

  describe("mmToPixels", () => {
    test("0mm should be 0 pixels from center", () => {
      const result = mmToPixels(0, canvasSize);
      expect(result).toBeCloseTo(0, 1);
    });

    test("170mm should convert to correct pixel distance", () => {
      const result = mmToPixels(REGULATION_BOARD.centerToOuterDouble, canvasSize);
      const expectedPixels =
        (REGULATION_BOARD.centerToOuterDouble / REGULATION_BOARD.wholeBoardDiameter) *
        2 *
        (canvasSize / 2);
      expect(result).toBeCloseTo(expectedPixels, 0.1);
    });

    test("round trip conversion should preserve values", () => {
      const originalMm = 100;
      const pixels = mmToPixels(originalMm, canvasSize);
      const backToMm = pixelsToMm(pixels, canvasSize);
      expect(backToMm).toBeCloseTo(originalMm, 0.01);
    });
  });

  describe("Computational vs Display canvas conversion", () => {
    test("center position should always map to 0,0 mm regardless of canvas size", () => {
      const computationalSize = 250; // e.g., 250x250 computation
      const displaySize = 500; // Always 500x500 display

      // Center in computational canvas
      const compX = computationalSize / 2; // 125
      const compY = computationalSize / 2; // 125

      // Scale to display canvas
      const scale = displaySize / computationalSize;
      const displayX = compX * scale; // 250
      const displayY = compY * scale; // 250

      // Distance from center in display canvas
      const centerX = displaySize / 2;
      const centerY = displaySize / 2;
      const xFromCenter = displayX - centerX; // 0
      const yFromCenter = displayY - centerY; // 0

      // Convert to mm
      const xMm = pixelsToMm(xFromCenter, displaySize);
      const yMm = pixelsToMm(yFromCenter, displaySize);

      expect(xMm).toBeCloseTo(0, 1);
      expect(yMm).toBeCloseTo(0, 1);
    });

    test("simulating OptimalTarget component conversion", () => {
      // Simulating what happens in the component
      const canvasSize = 250; // computation size
      const displayCanvasSize = 500;

      // Example position from computation (near center, slightly above)
      const currentOptimalPosition = { x: 125, y: 80 }; // In computational coords

      // Scale from computational resolution to display resolution
      const scale = displayCanvasSize / canvasSize;
      const displayX = currentOptimalPosition.x * scale; // 250
      const displayY = currentOptimalPosition.y * scale; // 160

      // Calculate distance from center in display pixels
      const centerX = displayCanvasSize / 2;
      const centerY = displayCanvasSize / 2;
      const xFromCenter = displayX - centerX; // 0
      const yFromCenter = displayY - centerY; // -90

      // Convert to mm using display canvas size
      const xMm = pixelsToMm(xFromCenter, displayCanvasSize);
      const yMm = pixelsToMm(yFromCenter, displayCanvasSize);

      console.log(
        `OptimalTarget simulation: Comp(${currentOptimalPosition.x}, ${currentOptimalPosition.y}) -> Display(${displayX}, ${displayY}) -> FromCenter(${xFromCenter}, ${yFromCenter}) -> MM(${xMm.toFixed(1)}, ${yMm.toFixed(1)})`,
      );

      // Should be close to center horizontally
      expect(Math.abs(xMm)).toBeLessThan(1);
      // Should be negative (above center) and reasonable
      expect(yMm).toBeLessThan(0);
      expect(Math.abs(yMm)).toBeLessThan(REGULATION_BOARD.centerToOuterDouble); // Within double ring
    });

    test("position at top center of computational canvas", () => {
      const computationalSize = 250;
      const displaySize = 500;

      // Top center in computational canvas
      const compX = computationalSize / 2; // 125
      const compY = 0; // Top edge

      // Scale to display canvas
      const scale = displaySize / computationalSize;
      const displayX = compX * scale; // 250
      const displayY = compY * scale; // 0

      // Distance from center in display canvas
      const centerX = displaySize / 2;
      const centerY = displaySize / 2;
      const xFromCenter = displayX - centerX; // 0
      const yFromCenter = displayY - centerY; // -250

      // Convert to mm
      const xMm = pixelsToMm(xFromCenter, displaySize);
      const yMm = pixelsToMm(yFromCenter, displaySize);

      console.log(
        `Top center: Comp(${compX}, ${compY}) -> Display(${displayX}, ${displayY}) -> FromCenter(${xFromCenter}, ${yFromCenter}) -> MM(${xMm.toFixed(1)}, ${yMm.toFixed(1)})`,
      );

      expect(xMm).toBeCloseTo(0, 1);
      expect(yMm).toBeCloseTo(-REGULATION_BOARD.wholeBoardDiameter / 2, 1); // Should be negative (above center) and board radius
    });
  });

  describe("Real-world coordinate test", () => {
    test("point near horizontal center and above should give reasonable values", () => {
      // Canvas coords near center horizontally and above vertically
      // Let's say X=250 (center), Y=100 (above center)
      const canvasX = 250;
      const canvasY = 100;

      const xFromCenter = canvasX - center; // Should be 0
      const yFromCenter = canvasY - center; // Should be -150

      const xMm = pixelsToMm(xFromCenter, canvasSize);
      const yMm = pixelsToMm(yFromCenter, canvasSize);

      console.log(
        `Canvas (${canvasX}, ${canvasY}) -> Distance from center: (${xFromCenter}, ${yFromCenter}) pixels -> (${xMm.toFixed(1)}, ${yMm.toFixed(1)}) mm`,
      );

      // X should be very close to 0 since we're at horizontal center
      expect(Math.abs(xMm)).toBeLessThan(1);

      // Y should be negative (above center) and reasonable
      expect(yMm).toBeLessThan(0);
      expect(Math.abs(yMm)).toBeLessThan(REGULATION_BOARD.centerToOuterDouble); // Should be within the double ring
    });
  });
});
