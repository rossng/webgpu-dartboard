import { atom } from "jotai";
import { gaussianStddevMmAtom, getGaussianStddevPixels } from "../shared/gaussianStddevAtom";
import { targetPositionAtom } from "../shared/targetPositionAtom";
import {
  EXPECTED_SCORE_CANVAS_SIZE,
  ExpectedScoreState,
  TargetPosition,
  expectedScoreStore,
} from "./ExpectedScoreStore";

// Re-export the shared target position atom for this module
export { targetPositionAtom };

export const isUserInteractingAtom = atom<boolean>(false);

// Internal state atom
export const expectedScoreStateAtom = atom<ExpectedScoreState>({
  expectedScoreRange: { min: 0, max: 0 },
  expectedScoreAtTarget: null,
  highestScorePosition: null,
  isComputing: false,
  resultData: null,
  renderBuffer: null,
  computationCounter: 0,
});

// Computed atom for expected score at target position
export const expectedScoreAtTargetAtom = atom<number | null>((get) => {
  const state = get(expectedScoreStateAtom);
  const targetPosition = get(targetPositionAtom);

  return expectedScoreStore.getExpectedScoreAtPosition(state.resultData, targetPosition);
});

// Action atoms for triggering computations
export const computeExpectedScoreAtom = atom(null, async (get, set) => {
  const gaussianStddevMm = get(gaussianStddevMmAtom);
  const gaussianStddev = getGaussianStddevPixels(gaussianStddevMm, EXPECTED_SCORE_CANVAS_SIZE);

  const updateState = (updates: Partial<ExpectedScoreState>) => {
    set(expectedScoreStateAtom, (prev) => ({ ...prev, ...updates }));
  };

  await expectedScoreStore.computeExpectedScore(gaussianStddev, updateState);
});

export const debouncedComputeExpectedScoreAtom = atom(null, (get, set) => {
  const gaussianStddevMm = get(gaussianStddevMmAtom);
  const gaussianStddev = getGaussianStddevPixels(gaussianStddevMm, EXPECTED_SCORE_CANVAS_SIZE);
  const isUserInteracting = get(isUserInteractingAtom);

  const updateState = (updates: Partial<ExpectedScoreState>) => {
    set(expectedScoreStateAtom, (prev) => ({ ...prev, ...updates }));
  };

  expectedScoreStore.debouncedCompute(gaussianStddev, updateState, isUserInteracting);
});

export const renderToCanvasAtom = atom(null, (get, _set, canvas: HTMLCanvasElement) => {
  const state = get(expectedScoreStateAtom);

  if (!state.resultData) return;

  expectedScoreStore.renderToCanvas(
    canvas,
    state.resultData,
    state.expectedScoreRange,
    state.highestScorePosition,
  );
});

// Action to initialize the store
export const initializeStoreAtom = atom(null, async (_get, _set) => {
  await expectedScoreStore.initialize();
});

// Cleanup action
export const cleanupStoreAtom = atom(null, (_get, _set) => {
  expectedScoreStore.cleanup();
});
