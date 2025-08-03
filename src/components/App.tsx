import React, { useState } from 'react';
import { WeightedGrid } from './WeightedGrid';
import { Dartboard } from './Dartboard';
import { ExpectedScore } from './ExpectedScore';
import { RenderBuffer } from './RenderBuffer';

type TabName = 'weighted-grid' | 'dartboard' | 'expected-score' | 'render-buffer';

interface Tab {
  id: TabName;
  label: string;
  component: React.FC;
}

const tabs: Tab[] = [
  { id: 'weighted-grid', label: 'Weighted Grid', component: WeightedGrid },
  { id: 'dartboard', label: 'Dartboard', component: Dartboard },
  { id: 'expected-score', label: 'Expected Score', component: ExpectedScore },
  { id: 'render-buffer', label: 'Render Buffer', component: RenderBuffer },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>('weighted-grid');

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || WeightedGrid;

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>WebGPU Dartboard</h1>
      
      <div style={{ marginBottom: '20px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              marginRight: '10px',
              backgroundColor: activeTab === tab.id ? '#0066cc' : '#f0f0f0',
              color: activeTab === tab.id ? 'white' : 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
              transition: 'background-color 0.3s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '4px' }}>
        <ActiveComponent />
      </div>
    </div>
  );
};