import React from "react";

export const WebGPUBanner: React.FC = () => {
  return (
    <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-5">
      <p className="font-semibold">
        Your browser doesn't support WebGPU. Please use a Chromium-based browser (Chrome, Edge, Opera, etc.).
        Firefox WebGPU support is coming soon!
      </p>
    </div>
  );
};