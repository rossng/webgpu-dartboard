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
  showDartboardColorsAtom,
} from "./optimalTargetAtoms";

interface OptimalTargetProps {
  defaultCanvasSize?: number;
}

export const OptimalTarget: React.FC<OptimalTargetProps> = ({ defaultCanvasSize = 250 }) => {
  // Jotai atoms
  const state = useAtomValue(optimalTargetStateAtom);
  const [currentSigmaMm, setCurrentSigmaMm] = useAtom(currentSigmaMmAtom);
  const [canvasSize, setCanvasSize] = useAtom(canvasSizeAtom);
  const [showDartboardColors, setShowDartboardColors] = useAtom(showDartboardColorsAtom);
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

  // Re-render canvas when sigma, results, or color mode changes
  useEffect(() => {
    if (canvasRef.current) {
      renderToCanvas(canvasRef.current);
    }
  }, [currentSigmaMm, state.results, showDartboardColors, renderToCanvas]);

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
    <div className="flex">
      <div className="flex-1">
        <p className="mb-4 text-gray-700">Now it's time to explore what happens as you get better (or worse) at throwing darts.</p>
        <p className="mb-6 text-gray-700">
          Drag the slider to change the standard deviation and watch how the optimal target position
          slides around the dartboard.
        </p>

        <div className="flex items-center">
          <div className="relative inline-block">
            {state.isComputing && <LoadingSpinner />}
            <CanvasVisualization
              id="optimal-target"
              width={500}
              height={500}
              onCanvasReady={handleCanvasReady}
            />
          </div>

          {optimalPositionMm && (
            <div className="ml-10 min-w-[150px] flex flex-col items-start justify-center h-[500px]"
            >
              <div className="text-xs text-gray-600 mb-2">
                Distance from center
              </div>
              <div className="text-2xl font-bold">
                <div>X: {optimalPositionMm.x.toFixed(1)} mm</div>
                <div>Y: {optimalPositionMm.y.toFixed(1)} mm</div>
              </div>
            </div>
          )}
        </div>

        {state.isComputing && (
          <div className="mt-5">
            <div className="flex items-center gap-2.5">
              <div className="text-base">Computing optimal targets...</div>
            </div>
            <p className="text-sm text-gray-600">
              {state.results.length > 0 && `Progress: ${state.results.length} positions computed`}
            </p>
          </div>
        )}

        {!state.isComputing && !state.isInitialized && (
          <div className="mt-5 p-2.5 bg-blue-50 rounded">
            <p className="m-0 text-sm">
              Initializing WebGPU and computing optimal target positions...
            </p>
          </div>
        )}
      </div>

      {/* Options sidebar */}
      <div className="sidebar-section">
        <h3 className="text-lg font-semibold mb-4">Options</h3>

        {/* Show Dartboard Colors Toggle */}
        <div className="mt-5">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showDartboardColors}
              onChange={(e) => setShowDartboardColors(e.target.checked)}
              className="mr-2"
            />
            Show Dartboard Colors
          </label>
          <p className="text-sm text-gray-600 mt-2">
            Use traditional dartboard colors.
          </p>
        </div>

        {/* Computation Resolution Control */}
        <div className="mt-5">
          <label className="block mb-1.5 font-bold">
            Resolution
          </label>
          <select
            value={canvasSize}
            onChange={(e) => setCanvasSize(Number(e.target.value))}
            className="w-full p-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
            disabled={state.isComputing}
          >
            <option value={100}>100x100 (Fast)</option>
            <option value={200}>200x200 (Medium)</option>
            <option value={250}>250x250 (Default)</option>
            <option value={300}>300x300 (High)</option>
            <option value={500}>500x500 (Very High)</option>
          </select>
          <p className="text-sm text-gray-600 mt-2">
            Higher resolution provides more accurate computation but takes longer to process.
          </p>
        </div>

        {/* Sigma Control */}
        <div className="mt-5">
          <label className="block mb-2 font-bold">
            Standard Deviation (σ): {currentSigmaMm.toFixed(1)} mm
          </label>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            value={currentSigmaMm}
            onChange={handleSigmaChange}
            className="w-full h-2 rounded bg-gray-300 outline-none cursor-pointer disabled:opacity-50"
            disabled={state.isComputing || !state.isInitialized}
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>1</span>
            <span>100</span>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Controls the spread of the throws. Higher values represent less accurate throwing.
          </p>
        </div>
      </div>
    </div>
  );
};
