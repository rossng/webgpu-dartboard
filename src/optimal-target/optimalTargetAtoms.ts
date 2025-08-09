import { atom } from "jotai";
import { gaussianStddevMmAtom } from "../shared/gaussianStddevAtom";
import { OptimalTargetState, OptimalTargetStore, SigmaRange } from "./OptimalTargetStore";

// Store instance atom - creates a new store instance per component
const storeAtom = atom<OptimalTargetStore | null>(null);

// Canvas size atom - can be updated by the component
export const canvasSizeAtom = atom<number>(250);

// Base atoms for input parameters (in mm)
export const sigmaRangeAtom = atom<SigmaRange>({
  min: 1,
  max: 100,
  step: 5,
});

// Use the shared gaussian stddev atom
export const currentSigmaMmAtom = gaussianStddevMmAtom;

// Show dartboard colors atom
export const showDartboardColorsAtom = atom<boolean>(true);

// Internal state atom
export const optimalTargetStateAtom = atom<OptimalTargetState>({
  results: [],
  isComputing: false,
  currentSigma: 50, // This will be in mm
  isInitialized: false,
});

// Derived atom for current optimal position
export const currentOptimalPositionAtom = atom((get) => {
  const state = get(optimalTargetStateAtom);
  const currentSigmaMm = get(currentSigmaMmAtom);
  const store = get(storeAtom);
  
  if (!store) return null;
  
  return store.getOptimalTargetForSigma(state.results, currentSigmaMm);
});

// Action to initialize the store with the current canvas size
export const initializeStoreAtom = atom(null, async (get, set) => {
  const canvasSize = get(canvasSizeAtom);
  let store = get(storeAtom);
  
  // Check if we need to create a new store (either doesn't exist or canvas size changed)
  if (!store || store.getCanvasSize() !== canvasSize) {
    console.log("Creating new store", { 
      hasStore: !!store, 
      oldCanvasSize: store?.getCanvasSize(), 
      newCanvasSize: canvasSize 
    });
    
    // Clean up old store if it exists
    if (store) {
      set(storeAtom, null);
    }
    
    // Create new store with current canvas size
    store = new OptimalTargetStore(canvasSize);
    set(storeAtom, store);
    await store.initialize();
    
    // Reset state when creating new store
    set(optimalTargetStateAtom, {
      results: [],
      isComputing: false,
      currentSigma: get(currentSigmaMmAtom),
      isInitialized: false,
    });
  } else {
    console.log("Store already exists with correct canvas size", canvasSize);
  }
});

// Action atoms for triggering computations
export const computeAllOptimalTargetsAtom = atom(null, async (get, set) => {
  const state = get(optimalTargetStateAtom);
  
  // Prevent multiple simultaneous computations
  if (state.isComputing) {
    console.log("Computation already in progress, skipping");
    return;
  }

  const sigmaRange = get(sigmaRangeAtom);
  const store = get(storeAtom);
  
  if (!store) {
    throw new Error("Store not initialized");
  }

  console.log("Starting computation with canvas size:", store.getCanvasSize());

  const updateState = (updates: Partial<OptimalTargetState>) => {
    set(optimalTargetStateAtom, (prev) => ({ ...prev, ...updates }));
  };

  await store.computeAllOptimalTargets(sigmaRange, updateState);
});

export const renderToCanvasAtom = atom(null, (get, _set, canvas: HTMLCanvasElement) => {
  const currentSigmaMm = get(currentSigmaMmAtom);
  const optimalPosition = get(currentOptimalPositionAtom);
  const showDartboardColors = get(showDartboardColorsAtom);
  const store = get(storeAtom);
  
  if (!store) return;
  
  store.renderToCanvas(canvas, currentSigmaMm, optimalPosition, showDartboardColors);
});

// Cleanup atom to be called on unmount
export const cleanupStoreAtom = atom(null, (get, set) => {
  const store = get(storeAtom);
  
  if (store) {
    // Clean up any resources if needed
    set(storeAtom, null);
    set(optimalTargetStateAtom, {
      results: [],
      isComputing: false,
      currentSigma: 50,
      isInitialized: false,
    });
    set(showDartboardColorsAtom, true); // Reset to default
  }
});