import { atom } from "jotai";
import { 
  ExpectedScoreState, 
  DisplayOptions, 
  TargetPosition, 
  expectedScoreStore 
} from "./ExpectedScoreStore";

// Base atoms for input parameters
export const gaussianStddevAtom = atom<number>(55); // ~50mm

export const targetPositionAtom = atom<TargetPosition>({ x: 0, y: 0 });

export const displayOptionsAtom = atom<DisplayOptions>({
  showSegmentBoundaries: true,
  showHighestScore: true,
});

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
  
  return expectedScoreStore.getExpectedScoreAtPosition(
    state.resultData,
    targetPosition
  );
});

// Action atoms for triggering computations
export const computeExpectedScoreAtom = atom(
  null,
  async (get, set) => {
    const gaussianStddev = get(gaussianStddevAtom);
    const displayOptions = get(displayOptionsAtom);
    
    const updateState = (updates: Partial<ExpectedScoreState>) => {
      set(expectedScoreStateAtom, (prev) => ({ ...prev, ...updates }));
    };

    await expectedScoreStore.computeExpectedScore(
      gaussianStddev,
      displayOptions,
      updateState
    );
  }
);

export const debouncedComputeExpectedScoreAtom = atom(
  null,
  (get, set) => {
    const gaussianStddev = get(gaussianStddevAtom);
    const displayOptions = get(displayOptionsAtom);
    const isUserInteracting = get(isUserInteractingAtom);
    
    const updateState = (updates: Partial<ExpectedScoreState>) => {
      set(expectedScoreStateAtom, (prev) => ({ ...prev, ...updates }));
    };

    expectedScoreStore.debouncedCompute(
      gaussianStddev,
      displayOptions,
      updateState,
      isUserInteracting
    );
  }
);

export const renderToCanvasAtom = atom(
  null,
  (get, _set, canvas: HTMLCanvasElement) => {
    const state = get(expectedScoreStateAtom);
    const displayOptions = get(displayOptionsAtom);
    
    if (!state.resultData) return;
    
    expectedScoreStore.renderToCanvas(
      canvas,
      state.resultData,
      state.expectedScoreRange,
      displayOptions,
      state.highestScorePosition
    );
  }
);

// Action to initialize the store
export const initializeStoreAtom = atom(
  null,
  async (_get, _set) => {
    await expectedScoreStore.initialize();
  }
);

// Cleanup action
export const cleanupStoreAtom = atom(
  null,
  (_get, _set) => {
    expectedScoreStore.cleanup();
  }
);