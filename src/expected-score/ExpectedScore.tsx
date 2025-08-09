import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useEffect, useRef } from "react";
import { CanvasVisualization } from "../common/CanvasVisualization";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { ViridisColorScale } from "../common/ViridisColorScale";
import { gaussianStddevMmAtom, getGaussianStddevPixels } from "../shared/gaussianStddevAtom";
import {
  cleanupStoreAtom,
  computeExpectedScoreAtom,
  debouncedComputeExpectedScoreAtom,
  expectedScoreAtTargetAtom,
  expectedScoreStateAtom,
  initializeStoreAtom,
  isUserInteractingAtom,
  renderToCanvasAtom,
  targetPositionAtom,
} from "./expectedScoreAtoms";
import { EXPECTED_SCORE_CANVAS_SIZE } from "./ExpectedScoreStore";
import { GaussianDistributionControls } from "./GaussianDistributionControls";
import { TargetIndicator } from "./TargetIndicator";
import { TargetPositionDisplay } from "./TargetPositionDisplay";

interface ExpectedScoreProps {}

export const ExpectedScore: React.FC<ExpectedScoreProps> = () => {
  // Jotai atoms
  const state = useAtomValue(expectedScoreStateAtom);
  const expectedScoreAtTarget = useAtomValue(expectedScoreAtTargetAtom);
  const [gaussianStddevMm, setGaussianStddevMm] = useAtom(gaussianStddevMmAtom);
  const [targetPosition, setTargetPosition] = useAtom(targetPositionAtom);
  const [isUserInteracting, setIsUserInteracting] = useAtom(isUserInteractingAtom);
  
  // Convert mm to pixels for the component
  const gaussianStddevPixels = getGaussianStddevPixels(gaussianStddevMm, EXPECTED_SCORE_CANVAS_SIZE);

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
  }, [isUserInteracting, computeExpectedScore]);

  // Trigger debounced computation when gaussian changes
  useEffect(() => {
    if (!canvasRef.current) return;
    debouncedComputeExpectedScore();
  }, [gaussianStddevMm, debouncedComputeExpectedScore]);

  // Re-render canvas when state changes
  useEffect(() => {
    if (canvasRef.current && state.resultData) {
      renderToCanvas(canvasRef.current);
    }
  }, [state.resultData, state.computationCounter, renderToCanvas]);

  const handleCanvasReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      canvasRef.current = canvas;
      computeExpectedScore();
    },
    [computeExpectedScore],
  );

  // Handle gaussian slider interactions
  const handleGaussianChange = useCallback(
    (pixels: number) => {
      const mm = pixels * (340 / EXPECTED_SCORE_CANVAS_SIZE); // Convert pixels back to mm
      setGaussianStddevMm(mm);
    },
    [setGaussianStddevMm],
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
    <div className="flex">
      <div className="flex-1">
        <p className="mb-4 text-gray-700">
          The best place to aim isn't always the highest-scoring spot. Sometimes it's better to aim
          a cluster of medium-high scoring spots.
        </p>
        <p className="mb-6 text-gray-700">
          This map shows your expected score for every single aiming spot on the board. The red dot
          shows the best location to aim.
        </p>
        {state && (
          <div className="flex items-center">
            <div className="relative inline-block">
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
              className="ml-5"
            />
            {expectedScoreAtTarget !== null && (
              <div
                className="ml-10 min-w-[120px] flex flex-col justify-center items-start"
                style={{ height: EXPECTED_SCORE_CANVAS_SIZE }}
              >
                <div className="text-xs text-gray-600 mb-1 text-left">
                  Expected Score
                </div>
                <div className="text-2xl font-bold text-left">
                  {expectedScoreAtTarget.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Options sidebar */}
      <div className="sidebar-section">
        <h3 className="text-lg font-semibold mb-4">Options</h3>

        <GaussianDistributionControls
          gaussianStddevPixels={gaussianStddevPixels}
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
