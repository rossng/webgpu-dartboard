import { useCallback, useRef, useState } from 'react';

export function useQueuedComputation<T extends any[]>(
  computationFn: (...args: T) => Promise<void>
) {
  const [isComputing, setIsComputing] = useState(false);
  const currentComputationRef = useRef<Promise<void> | null>(null);
  const queuedComputationRef = useRef<(() => void) | null>(null);

  const executeComputation = useCallback(async (...args: T) => {
    // If there's already a computation running, queue this one
    if (currentComputationRef.current) {
      queuedComputationRef.current = () => executeComputation(...args);
      return;
    }

    // Start the computation
    setIsComputing(true);
    const computationPromise = computationFn(...args);
    currentComputationRef.current = computationPromise;

    try {
      await computationPromise;
    } finally {
      // Computation finished
      currentComputationRef.current = null;
      setIsComputing(false);

      // If there's a queued computation, start it
      if (queuedComputationRef.current) {
        const queuedFn = queuedComputationRef.current;
        queuedComputationRef.current = null;
        // Use setTimeout to avoid deep recursion
        setTimeout(queuedFn, 0);
      }
    }
  }, [computationFn]);

  return {
    executeComputation,
    isComputing,
  };
}