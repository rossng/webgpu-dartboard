import React, { useEffect, useRef } from "react";
import { mmToPixels, pixelsToMm } from "../dartboard/dartboard-definition";

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
  // Current value in mm
  const gaussianStddevMm = pixelsToMm(gaussianStddevPixels, canvasWidth);

  // Track interaction state
  const isDraggingRef = useRef(false);

  // Handle slider change - convert mm to pixels
  const handleSliderChange = (mmValue: number) => {
    const pixelValue = mmToPixels(mmValue, canvasWidth);
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
      <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
        Standard Deviation (σ): {gaussianStddevMm.toFixed(1)} mm
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
      <p style={{ fontSize: "12px", color: "#888" }}>
        Controls the spread of the throws. Higher values represent less accurate throwing.
      </p>
    </div>
  );
};
