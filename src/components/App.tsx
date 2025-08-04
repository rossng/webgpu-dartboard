import React, { useState } from "react";
import { Dartboard } from "../dartboard/Dartboard";
import { ExpectedScore } from "../expected-score/ExpectedScore";
import { HitDistribution } from "../hit-distribution/HitDistribution";
import { ScoreAreas } from "../score-areas/ScoreAreas";
import { ScoreDistribution } from "../score-distribution/ScoreDistribution";

type TabName =
  | "hit-distribution"
  | "score-distribution"
  | "dartboard"
  | "score-areas"
  | "expected-score";

interface Tab {
  id: TabName;
  label: string;
  component: React.FC;
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

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component || HitDistribution;

  return (
    <div style={{ height: "100vh", fontFamily: "Arial, sans-serif", padding: "20px", overflow: "auto" }}>
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
        <ActiveComponent />
      </div>
    </div>
  );
};
