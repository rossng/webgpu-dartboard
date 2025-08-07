import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useEffect, useRef } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { ViridisColorScale } from "../common/ViridisColorScale";
import {
  cleanupStoreAtom,
  computeExpectedScoreAtom,
  debouncedComputeExpectedScoreAtom,
  displayOptionsAtom,
  expectedScoreAtTargetAtom,
  expectedScoreStateAtom,
  gaussianStddevAtom,
  initializeStoreAtom,
  isUserInteractingAtom,
  renderToCanvasAtom,
  targetPositionAtom,
} from "./expectedScoreAtoms";
import { GaussianDistributionControls } from "./GaussianDistributionControls";
import { TargetIndicator } from "./TargetIndicator";
import { TargetPositionDisplay } from "./TargetPositionDisplay";

const EXPECTED_SCORE_CANVAS_SIZE = 500;

interface ExpectedScoreProps {}

export const ExpectedScore: React.FC<ExpectedScoreProps> = () => {
  // Jotai atoms
  const state = useAtomValue(expectedScoreStateAtom);
  const expectedScoreAtTarget = useAtomValue(expectedScoreAtTargetAtom);
  const [gaussianStddev, setGaussianStddev] = useAtom(gaussianStddevAtom);
  const [targetPosition, setTargetPosition] = useAtom(targetPositionAtom);
  const [displayOptions, setDisplayOptions] = useAtom(displayOptionsAtom);
  const [isUserInteracting, setIsUserInteracting] = useAtom(isUserInteractingAtom);

  // Action atoms
  const initializeStore = useSetAtom(initializeStoreAtom);
  const computeExpectedScore = useSetAtom(computeExpectedScoreAtom);
  const debouncedComputeExpectedScore = useSetAtom(debouncedComputeExpectedScoreAtom);
  const renderToCanvas = useSetAtom(renderToCanvasAtom);
  const cleanup = useSetAtom(cleanupStoreAtom);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize store on mount
  useEffect(() => {
    initializeStore();
    return cleanup;
  }, [initializeStore, cleanup]);

  // Trigger computation when display options change (immediate)
  useEffect(() => {
    if (!canvasRef.current || isUserInteracting) return;
    computeExpectedScore();
  }, [
    displayOptions.showSegmentBoundaries,
    displayOptions.showHighestScore,
    isUserInteracting,
    computeExpectedScore,
  ]);

  // Trigger debounced computation when gaussian changes
  useEffect(() => {
    if (!canvasRef.current) return;
    debouncedComputeExpectedScore();
  }, [gaussianStddev, debouncedComputeExpectedScore]);

  // Re-render canvas when state changes
  useEffect(() => {
    if (canvasRef.current && state.resultData) {
      renderToCanvas(canvasRef.current);
    }
  }, [state.resultData, state.computationCounter, displayOptions, renderToCanvas]);

  const handleCanvasReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      canvasRef.current = canvas;
      computeExpectedScore();
    },
    [computeExpectedScore],
  );

  // Handle gaussian slider interactions
  const handleGaussianChange = useCallback(
    (value: number) => {
      setGaussianStddev(value);
    },
    [setGaussianStddev],
  );

  const handleGaussianInteractionStart = useCallback(() => {
    setIsUserInteracting(true);
  }, [setIsUserInteracting]);

  const handleGaussianInteractionEnd = useCallback(() => {
    setIsUserInteracting(false);
  }, [setIsUserInteracting]);

  // Handle target position changes
  const handleTargetPositionChange = useCallback(
    (position: { x: number; y: number }) => {
      setTargetPosition(position);
    },
    [setTargetPosition],
  );

  return (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1 }}>
        <h2>Expected Score</h2>
        <p>
          The expected score when aiming at each position on the dartboard, calculated by summing
          probability-weighted scores across all possible hit locations. Brighter areas indicate
          higher expected scores, showing optimal aiming points.
        </p>
        {state && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              {state.isComputing && <LoadingSpinner />}
              <CanvasVisualization
                id="expected-score"
                width={EXPECTED_SCORE_CANVAS_SIZE}
                height={EXPECTED_SCORE_CANVAS_SIZE}
                onCanvasReady={handleCanvasReady}
              />
              <TargetIndicator
                targetPosition={targetPosition}
                onTargetPositionChange={handleTargetPositionChange}
                onDragStart={() => {
                  setIsUserInteracting(true);
                }}
                onDragEnd={() => {
                  setIsUserInteracting(false);
                }}
                canvasWidth={EXPECTED_SCORE_CANVAS_SIZE}
                canvasHeight={EXPECTED_SCORE_CANVAS_SIZE}
              />
            </div>
            <ViridisColorScale
              height={EXPECTED_SCORE_CANVAS_SIZE}
              min={state.expectedScoreRange.min}
              max={state.expectedScoreRange.max}
              style={{ marginLeft: "20px" }}
            />
            {expectedScoreAtTarget !== null && (
              <div
                style={{
                  marginLeft: "40px",
                  fontSize: "24px",
                  fontWeight: "bold",
                  minWidth: "120px",
                  display: "flex",
                  alignItems: "center",
                  height: EXPECTED_SCORE_CANVAS_SIZE,
                }}
              >
                {expectedScoreAtTarget.toFixed(2)}
              </div>
            )}
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

        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.showSegmentBoundaries}
              onChange={(e) =>
                setDisplayOptions((prev) => ({ ...prev, showSegmentBoundaries: e.target.checked }))
              }
              style={{ marginRight: "8px" }}
            />
            Show Segment Boundaries
          </label>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Overlay subtle lines showing dartboard segment divisions and scoring rings.
          </p>
        </div>

        <div style={{ marginTop: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.showHighestScore}
              onChange={(e) =>
                setDisplayOptions((prev) => ({ ...prev, showHighestScore: e.target.checked }))
              }
              style={{ marginRight: "8px" }}
            />
            Show Highest Expected Score
          </label>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
            Display a red dot at the position with the highest expected score on the dartboard.
          </p>
        </div>

        <GaussianDistributionControls
          gaussianStddevPixels={gaussianStddev}
          onGaussianStddevPixelsChange={handleGaussianChange}
          onInteractionStart={handleGaussianInteractionStart}
          onInteractionEnd={handleGaussianInteractionEnd}
          canvasWidth={EXPECTED_SCORE_CANVAS_SIZE}
        />

        <TargetPositionDisplay
          targetPosition={targetPosition}
          onTargetPositionChange={handleTargetPositionChange}
        />
      </div>
    </div>
  );
};
