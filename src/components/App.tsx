import React, { useState } from "react";
import { Dartboard } from "./Dartboard";
import { HitDistribution } from "./HitDistribution";
import { OptimalAiming } from "./OptimalAiming";
import { RenderBuffer } from "./RenderBuffer";
import { ScoreDistribution } from "./ScoreDistribution";

type TabName =
  | "hit-distribution"
  | "score-distribution"
  | "dartboard"
  | "optimal-aiming"
  | "render-buffer";

interface Tab {
  id: TabName;
  label: string;
  component: React.FC<{ showDartboardColors?: boolean }>;
}

const tabs: Tab[] = [
  { id: "hit-distribution", label: "Hit Distribution", component: HitDistribution },
  { id: "score-distribution", label: "Score Distribution", component: ScoreDistribution },
  { id: "dartboard", label: "Dartboard", component: Dartboard },
  { id: "optimal-aiming", label: "Optimal Aiming", component: OptimalAiming },
  { id: "render-buffer", label: "Render Buffer", component: RenderBuffer },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>("hit-distribution");
  const [showDartboardColors, setShowDartboardColors] = useState(false);

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
          <ActiveComponent showDartboardColors={showDartboardColors} />
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
      </div>
    </div>
  );
};
