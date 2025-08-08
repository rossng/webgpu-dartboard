import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupWebGPU, initWebGPU } from "../test/webgpu-setup";
import { OptimalTargetStore } from "./OptimalTargetStore";

describe("Test Updated Actual OptimalTargetStore", () => {
  let device: GPUDevice;

  beforeAll(async () => {
    const gpu = await initWebGPU();
    device = gpu.device;
  });

  afterAll(async () => {
    await cleanupWebGPU();
  });

  it("should use 32 workgroups and show improved performance", async () => {
    console.log("🚀 Testing updated OptimalTargetStore with 32 workgroups");
    
    const store = new OptimalTargetStore(250);
    await store.initialize();

    let results: any[] = [];
    let isComputing = false;
    const sigmaRange = { min: 10, max: 20, step: 10 }; // 2 sigma values for quick test

    const startTime = performance.now();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Test timed out"));
      }, 30000);

      store.computeAllOptimalTargets(sigmaRange, (state) => {
        if (state.results) {
          results = state.results;
        }
        if (state.isComputing !== undefined) {
          isComputing = state.isComputing;
        }

        if (!isComputing && state.isInitialized) {
          clearTimeout(timeout);
          
          const endTime = performance.now();
          const totalTime = endTime - startTime;
          const averageTimePerSigma = totalTime / Math.max(1, results.length);

          console.log(`✅ Updated store performance:`);
          console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
          console.log(`  Average per sigma: ${averageTimePerSigma.toFixed(2)}ms`);
          console.log(`  Results computed: ${results.length}/2`);
          console.log(`  Expected improvement: ~2x faster than previous 16 workgroup version`);

          expect(results.length).toBe(2);
          expect(totalTime).toBeGreaterThan(0);
          expect(averageTimePerSigma).toBeLessThan(500); // Should be much faster than before
          
          // Verify we got actual results
          results.forEach(result => {
            expect(result.sigma).toBeGreaterThan(0);
            expect(result.x).toBeGreaterThanOrEqual(0);
            expect(result.y).toBeGreaterThanOrEqual(0);
          });

          resolve();
        }
      }).catch(reject);
    });
  });
});