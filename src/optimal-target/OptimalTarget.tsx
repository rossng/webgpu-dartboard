import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { pixelsToMm } from "../dartboard/dartboard-definition";
import {
  canvasSizeAtom,
  cleanupStoreAtom,
  computeAllOptimalTargetsAtom,
  currentOptimalPositionAtom,
  currentSigmaMmAtom,
  initializeStoreAtom,
  optimalTargetStateAtom,
  renderToCanvasAtom,
} from "./optimalTargetAtoms";

interface OptimalTargetProps {
  defaultCanvasSize?: number;
}

export const OptimalTarget: React.FC<OptimalTargetProps> = ({ defaultCanvasSize = 250 }) => {
  // Jotai atoms
  const state = useAtomValue(optimalTargetStateAtom);
  const [currentSigmaMm, setCurrentSigmaMm] = useAtom(currentSigmaMmAtom);
  const [canvasSize, setCanvasSize] = useAtom(canvasSizeAtom);
  const currentOptimalPosition = useAtomValue(currentOptimalPositionAtom);

  // Action atoms
  const initializeStore = useSetAtom(initializeStoreAtom);
  const computeAllOptimalTargets = useSetAtom(computeAllOptimalTargetsAtom);
  const renderToCanvas = useSetAtom(renderToCanvasAtom);
  const cleanupStore = useSetAtom(cleanupStoreAtom);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const computationStartedRef = useRef(false);

  // Set initial canvas size on mount
  useEffect(() => {
    setCanvasSize(defaultCanvasSize);
  }, [defaultCanvasSize, setCanvasSize]);

  // Initialize store when canvas size changes
  useEffect(() => {
    computationStartedRef.current = false; // Reset computation flag when canvas size changes
    initializeStore();
  }, [canvasSize, initializeStore]);

  // Compute all targets after initialization (only once per store instance)
  useEffect(() => {
    // Only start computation if store is ready and we haven't computed yet
    if (
      !state.isComputing &&
      !state.isInitialized &&
      state.results.length === 0 &&
      !computationStartedRef.current
    ) {
      console.log("Starting computation from effect", {
        isComputing: state.isComputing,
        isInitialized: state.isInitialized,
        resultsLength: state.results.length,
      });
      computationStartedRef.current = true;
      computeAllOptimalTargets();
    }
  }, [state.isComputing, state.isInitialized, state.results.length, computeAllOptimalTargets]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStore();
    };
  }, [cleanupStore]);

  // Re-render canvas when sigma or results change
  useEffect(() => {
    if (canvasRef.current) {
      renderToCanvas(canvasRef.current);
    }
  }, [currentSigmaMm, state.results, renderToCanvas]);

  const handleCanvasReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      canvasRef.current = canvas;
      // Render immediately when canvas is ready
      renderToCanvas(canvas);
    },
    [renderToCanvas],
  );

  const handleSigmaChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrentSigmaMm(Number(e.target.value));
    },
    [setCurrentSigmaMm],
  );

  // Convert pixel coordinates to mm from center
  const optimalPositionMm = useMemo(() => {
    if (!currentOptimalPosition) return null;

    // The optimal position is in computational canvas coordinates (0 to canvasSize)
    // We need to:
    // 1. Convert from computational canvas coords to display canvas coords
    // 2. Find distance from center
    // 3. Convert to mm

    // Scale from computational resolution to display resolution (500x500)
    const displayCanvasSize = 500;
    const scale = displayCanvasSize / canvasSize;
    const displayX = currentOptimalPosition.x * scale;
    const displayY = currentOptimalPosition.y * scale;

    // Calculate distance from center in display pixels
    const centerX = displayCanvasSize / 2;
    const centerY = displayCanvasSize / 2;
    const xFromCenter = displayX - centerX;
    const yFromCenter = displayY - centerY;

    // Convert to mm using display canvas size
    const xMm = pixelsToMm(xFromCenter, displayCanvasSize);
    const yMm = pixelsToMm(yFromCenter, displayCanvasSize);

    return { x: xMm, y: yMm };
  }, [currentOptimalPosition, canvasSize]);

  return (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1 }}>
        <h2>Optimal Target Position</h2>
        <p>
          Shows the optimal aiming position for different Gaussian distribution standard deviations
          (sigma). Use the slider to change the sigma value and see how the optimal target position
          changes.
        </p>

        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            {state.isComputing && <LoadingSpinner />}
            <CanvasVisualization
              id="optimal-target"
              width={500}
              height={500}
              onCanvasReady={handleCanvasReady}
            />
          </div>

          {optimalPositionMm && (
            <div
              style={{
                marginLeft: "40px",
                minWidth: "150px",
                display: "flex",
                flexDirection: "column",
                alignItems: "start",
                justifyContent: "center",
                height: 500,
              }}
            >
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
                Distance from center
              </div>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                <div>X: {optimalPositionMm.x.toFixed(1)} mm</div>
                <div>Y: {optimalPositionMm.y.toFixed(1)} mm</div>
              </div>
            </div>
          )}
        </div>

        {state.isComputing && (
          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ fontSize: "16px" }}>Computing optimal targets...</div>
            </div>
            <p style={{ fontSize: "14px", color: "#666" }}>
              {state.results.length > 0 && `Progress: ${state.results.length} positions computed`}
            </p>
          </div>
        )}

        {!state.isComputing && !state.isInitialized && (
          <div
            style={{
              marginTop: "20px",
              padding: "10px",
              backgroundColor: "#e8f4f8",
              borderRadius: "4px",
            }}
          >
            <p style={{ margin: 0, fontSize: "14px" }}>
              Initializing WebGPU and computing optimal target positions...
            </p>
          </div>
        )}
      </div>

      {/* Options sidebar */}
      <div
        style={{
          width: "300px",
          padding: "20px",
          backgroundColor: "#f8f8f8",
          borderLeft: "1px solid #ddd",
          overflow: "auto",
        }}
      >
        <h3>Options</h3>

        {/* Computation Resolution Control */}
        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
            Resolution
          </label>
          <select
            value={canvasSize}
            onChange={(e) => setCanvasSize(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "5px",
              fontSize: "14px",
              borderRadius: "4px",
              border: "1px solid #ddd",
            }}
            disabled={state.isComputing}
          >
            <option value={100}>100x100 (Fast)</option>
            <option value={200}>200x200 (Medium)</option>
            <option value={250}>250x250 (Default)</option>
            <option value={300}>300x300 (High)</option>
            <option value={500}>500x500 (Very High)</option>
          </select>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Higher resolution provides more accurate computation but takes longer to process.
          </p>
        </div>

        {/* Sigma Control */}
        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
            Standard Deviation (σ): {currentSigmaMm.toFixed(1)} mm
          </label>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            value={currentSigmaMm}
            onChange={handleSigmaChange}
            style={{
              width: "100%",
              height: "8px",
              borderRadius: "4px",
              background: "#ddd",
              outline: "none",
              cursor: "pointer",
            }}
            disabled={state.isComputing || !state.isInitialized}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "12px",
              color: "#666",
              marginTop: "4px",
            }}
          >
            <span>1</span>
            <span>100</span>
          </div>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Controls the spread of the Gaussian distribution. Higher values represent less accurate
            throws.
          </p>
        </div>
      </div>
    </div>
  );
};
