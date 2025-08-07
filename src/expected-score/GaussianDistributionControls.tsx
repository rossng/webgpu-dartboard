import React, { useEffect, useRef } from "react";
import { REGULATION_BOARD, normaliseDartboard } from "../dartboard/dartboard-definition";

interface GaussianDistributionControlsProps {
  gaussianStddevPixels: number;
  onGaussianStddevPixelsChange: (pixels: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  canvasWidth?: number;
}

export const GaussianDistributionControls: React.FC<GaussianDistributionControlsProps> = ({
  gaussianStddevPixels,
  onGaussianStddevPixelsChange,
  onInteractionStart,
  onInteractionEnd,
  canvasWidth = 1000,
}) => {
  const normalizedDartboard = normaliseDartboard(REGULATION_BOARD);
  const centerToOuterDoubleNormalized = normalizedDartboard.centerToOuterDouble;
  const centerToOuterDoubleMm = REGULATION_BOARD.centerToOuterDouble;

  const pixelToMm = centerToOuterDoubleMm / (centerToOuterDoubleNormalized * (canvasWidth / 2));
  const mmToPixel = 1 / pixelToMm;

  // Current value in mm
  const gaussianStddevMm = gaussianStddevPixels * pixelToMm;

  // Track interaction state
  const isDraggingRef = useRef(false);

  // Handle slider change - convert mm to pixels
  const handleSliderChange = (mmValue: number) => {
    const pixelValue = mmValue * mmToPixel;
    onGaussianStddevPixelsChange(pixelValue);
  };

  // Handle mouse down - start interaction and set up global listeners
  const handleMouseDown = () => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      onInteractionStart?.();

      // Set up global mouse up listener
      const handleMouseUp = () => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onInteractionEnd?.();
          document.removeEventListener("mouseup", handleMouseUp);
          document.removeEventListener("touchend", handleMouseUp);
        }
      };

      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchend", handleMouseUp);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onInteractionEnd?.();
      }
    };
  }, [onInteractionEnd]);

  return (
    <div style={{ marginTop: "30px" }}>
      <h3>Gaussian Distribution</h3>
      <div style={{ marginBottom: "15px" }}>
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          Standard Deviation: {gaussianStddevMm.toFixed(1)} mm
        </label>
        <input
          type="range"
          min="1"
          max="250"
          step="1"
          value={gaussianStddevMm}
          onChange={(e) => handleSliderChange(Number(e.target.value))}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          style={{ width: "100%", marginBottom: "8px" }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#666",
          }}
        >
          <span>Precise (1 mm)</span>
          <span>Spread (250 mm)</span>
        </div>
      </div>
      <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
        Pixel value: {gaussianStddevPixels.toFixed(0)} px
      </div>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Controls the spread of the Gaussian distribution. Lower values mean more precise throws,
        higher values mean more scattered throws. Based on regulation dartboard dimensions (
        {REGULATION_BOARD.centerToOuterDouble}mm to outer double ring).
      </p>
    </div>
  );
};
