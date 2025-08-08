import { atom } from "jotai";
import { mmToPixels } from "../dartboard/dartboard-definition";
import {
  EXPECTED_SCORE_CANVAS_SIZE,
  ExpectedScoreState,
  TargetPosition,
  expectedScoreStore,
} from "./ExpectedScoreStore";

// Constants for conversion
const DEFAULT_STDDEV_MM = 50;

// Calculate pixel value from mm
const defaultStddevPixels = mmToPixels(DEFAULT_STDDEV_MM, EXPECTED_SCORE_CANVAS_SIZE);

// Base atoms for input parameters
export const gaussianStddevAtom = atom<number>(defaultStddevPixels); // 50mm default in pixels

export const targetPositionAtom = atom<TargetPosition>({ x: 0, y: 0 });

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
  const gaussianStddev = get(gaussianStddevAtom);

  const updateState = (updates: Partial<ExpectedScoreState>) => {
    set(expectedScoreStateAtom, (prev) => ({ ...prev, ...updates }));
  };

  await expectedScoreStore.computeExpectedScore(gaussianStddev, updateState);
});

export const debouncedComputeExpectedScoreAtom = atom(null, (get, set) => {
  const gaussianStddev = get(gaussianStddevAtom);
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
