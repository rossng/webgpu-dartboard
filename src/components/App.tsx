import React, { useEffect, useState } from "react";
import { Dartboard } from "../dartboard/Dartboard";
import { ExpectedScore } from "../expected-score/ExpectedScore";
import { HitDistribution } from "../hit-distribution/HitDistribution";
import { OptimalTarget } from "../optimal-target/OptimalTarget";
import { ScoreDistribution } from "../score-distribution/ScoreDistribution";

type TabName =
  | "hit-distribution"
  | "score-distribution"
  | "dartboard"
  | "expected-score"
  | "optimal-target";

interface Tab {
  id: TabName;
  label: string;
  component: React.FC;
}

const tabs: Tab[] = [
  { id: "dartboard", label: "1. Dartboard", component: Dartboard },
  { id: "hit-distribution", label: "2. Hit Distribution", component: HitDistribution },
  { id: "score-distribution", label: "3. Score Distribution", component: ScoreDistribution },
  { id: "expected-score", label: "4. Expected Score", component: ExpectedScore },
  { id: "optimal-target", label: "5. Skill Explorer", component: OptimalTarget },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>(() => {
    const savedTab = localStorage.getItem("webgpu-dartboard-active-tab");
    return (savedTab as TabName) || "dartboard";
  });

  useEffect(() => {
    localStorage.setItem("webgpu-dartboard-active-tab", activeTab);
  }, [activeTab]);

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component || HitDistribution;

  return (
    <div className="h-screen font-sans p-5 overflow-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="m-0 text-2xl font-bold">Where should I aim?</h1>
        <a
          href="https://github.com/rossng/where-should-i-aim"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 no-underline rounded text-sm transition-bg hover:bg-gray-200"
        >
          <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          rossng/where-should-i-aim
        </a>
      </div>

      <div className="mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-button ${
              activeTab === tab.id ? "tab-button-active" : "tab-button-inactive"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="border border-gray-300 p-5 rounded">
        <ActiveComponent />
      </div>
    </div>
  );
};
