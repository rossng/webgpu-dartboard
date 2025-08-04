import React from 'react';

interface TargetPositionDisplayProps {
  targetPosition: { x: number; y: number };
  onTargetPositionChange: (position: { x: number; y: number }) => void;
}

export const TargetPositionDisplay: React.FC<TargetPositionDisplayProps> = ({
  targetPosition,
  onTargetPositionChange,
}) => {
  const handleReset = () => {
    onTargetPositionChange({ x: 0, y: 0 });
  };

  // Convert normalized coordinates to millimeters
  // Normalized coordinate range is -1 to +1 (2 units total)
  // CENTER_TO_OUTER_DOUBLE (0.753881279 normalized) = 170mm real dartboard
  // So 1 normalized unit = 170mm / 0.753881279 = 225.5mm
  const normalizedToMm = 170 / 0.753881279; // ≈ 225.5 mm per normalized unit
  const xMm = targetPosition.x * normalizedToMm;
  const yMm = targetPosition.y * normalizedToMm;

  return (
    <div style={{ marginTop: "30px" }}>
      <h3>Target Position</h3>
      <div style={{ fontSize: "14px", color: "#333", marginBottom: "10px" }}>
        <p style={{ marginBottom: "4px" }}>
          X: {xMm.toFixed(1)} mm
          <span style={{ fontSize: "11px", color: "#999", marginLeft: "8px" }}>
            ({targetPosition.x.toFixed(3)})
          </span>
        </p>
        <p>
          Y: {yMm.toFixed(1)} mm
          <span style={{ fontSize: "11px", color: "#999", marginLeft: "8px" }}>
            ({targetPosition.y.toFixed(3)})
          </span>
        </p>
      </div>
      <button
        onClick={handleReset}
        style={{
          padding: "6px 12px",
          fontSize: "12px",
          backgroundColor: "#f0f0f0",
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
          marginBottom: "8px",
        }}
      >
        Reset to Center
      </button>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Drag the crosshair on the visualization to change the aim point.
      </p>
    </div>
  );
};