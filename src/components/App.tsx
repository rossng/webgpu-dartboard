import React, { useState } from "react";
import { Dartboard } from "./Dartboard";
import { ExpectedScore } from "./ExpectedScore";
import { HitDistribution } from "./HitDistribution";
import { ScoreAreas } from "./ScoreAreas";
import { ScoreDistribution } from "./ScoreDistribution";

type TabName =
  | "hit-distribution"
  | "score-distribution"
  | "dartboard"
  | "score-areas"
  | "expected-score";

interface Tab {
  id: TabName;
  label: string;
  component: React.FC<{
    showDartboardColors?: boolean;
    targetPosition?: { x: number; y: number };
    onTargetPositionChange?: (position: { x: number; y: number }) => void;
    gaussianStddev?: number;
    showSegmentBoundaries?: boolean;
  }>;
}

const tabs: Tab[] = [
  { id: "dartboard", label: "Dartboard", component: Dartboard },
  { id: "score-areas", label: "Score Areas", component: ScoreAreas },
  { id: "hit-distribution", label: "Hit Distribution", component: HitDistribution },
  { id: "score-distribution", label: "Score Distribution", component: ScoreDistribution },
  { id: "expected-score", label: "Expected Score", component: ExpectedScore },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>("dartboard");
  const [showDartboardColors, setShowDartboardColors] = useState(false);
  const [showSegmentBoundaries, setShowSegmentBoundaries] = useState(false);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 }); // Normalized coordinates (-1 to 1)
  const [gaussianStddev, setGaussianStddev] = useState(100); // Standard deviation in pixels

  // Convert pixels to millimeters:
  // - Canvas is 500px representing -1 to +1 normalized coords (2 units total)
  // - So 250px = 1 normalized unit
  // - CENTER_TO_OUTER_DOUBLE (0.753881279 normalized) = 170mm real dartboard
  // - So 1 normalized unit = 170mm / 0.753881279 = 225.5mm
  // - Therefore 250px = 225.5mm, so 1px = 0.902mm
  const pixelToMm = 170 / (0.753881279 * 250); // ≈ 0.902 mm/pixel
  const gaussianStddevMm = gaussianStddev * pixelToMm;

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component || HitDistribution;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial, sans-serif" }}>
      {/* Main content area */}
      <div style={{ flex: 1, padding: "20px", overflow: "auto" }}>
        <h1>WebGPU Dartboard</h1>

        <div style={{ marginBottom: "20px" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 20px",
                marginRight: "10px",
                marginBottom: "10px",
                backgroundColor: activeTab === tab.id ? "#0066cc" : "#f0f0f0",
                color: activeTab === tab.id ? "white" : "black",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "16px",
                transition: "background-color 0.3s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ border: "1px solid #ddd", padding: "20px", borderRadius: "4px" }}>
          <ActiveComponent
            showDartboardColors={showDartboardColors}
            showSegmentBoundaries={showSegmentBoundaries}
            targetPosition={targetPosition}
            onTargetPositionChange={setTargetPosition}
            gaussianStddev={gaussianStddev}
          />
        </div>
      </div>

      {/* Sidebar for global controls */}
      <div
        style={{
          width: "300px",
          padding: "20px",
          backgroundColor: "#f8f8f8",
          borderLeft: "1px solid #ddd",
          overflow: "auto",
        }}
      >
        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showDartboardColors}
              onChange={(e) => setShowDartboardColors(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Show Dartboard Colors
          </label>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Display visualizations with traditional dartboard colors (green and cream segments).
          </p>
        </div>

        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showSegmentBoundaries}
              onChange={(e) => setShowSegmentBoundaries(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Show Segment Boundaries
          </label>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Overlay subtle lines showing dartboard segment divisions and scoring rings (Expected Score tab only).
          </p>
        </div>

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
              min="25"
              max="300"
              step="5"
              value={gaussianStddev}
              onChange={(e) => setGaussianStddev(Number(e.target.value))}
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
              <span>Precise ({(25 * pixelToMm).toFixed(1)} mm)</span>
              <span>Spread ({(300 * pixelToMm).toFixed(1)} mm)</span>
            </div>
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
            Pixel value: {gaussianStddev} px
          </div>
          <p style={{ fontSize: "12px", color: "#888" }}>
            Controls the spread of the Gaussian distribution. Lower values mean more precise throws,
            higher values mean more scattered throws. Based on regulation dartboard dimensions
            (170mm to outer double ring).
          </p>
        </div>

        <div style={{ marginTop: "30px" }}>
          <h3>Target Position</h3>
          <div style={{ fontSize: "14px", color: "#666" }}>
            <p>X: {targetPosition.x.toFixed(3)}</p>
            <p>Y: {targetPosition.y.toFixed(3)}</p>
          </div>
          <p style={{ fontSize: "12px", color: "#888", marginTop: "8px" }}>
            Drag the crosshair on the visualization to change the aim point.
          </p>
        </div>
      </div>
    </div>
  );
};
