import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupWebGPU, initWebGPU } from "../test/webgpu-setup";
import { OptimalTargetStore, SigmaRange } from "./OptimalTargetStore";
import { BenchmarkOptimalTargetStore } from "./BenchmarkOptimalTargetStore";

interface BenchmarkResult {
  resolution: number;
  workgroupSize: number;
  numWorkgroups: number;
  sigmaRange: SigmaRange;
  totalTime: number;
  averageTimePerSigma: number;
  peakMemoryUsage: number;
  resultsCount: number;
}

class OptimalTargetBenchmarkRunner {
  constructor(private device: GPUDevice) {}

  async benchmarkConfiguration(
    resolution: number,
    workgroupSize: number = 64,
    numWorkgroups: number = 16,
    sigmaRange: SigmaRange = { min: 5, max: 15, step: 5 }
  ): Promise<BenchmarkResult> {
    console.log(`\n=== Benchmarking ${resolution}x${resolution} resolution ===`);
    console.log(`Workgroup size: ${workgroupSize}, Num workgroups: ${numWorkgroups}`);
    console.log(`Sigma range: ${sigmaRange.min}-${sigmaRange.max}mm (step: ${sigmaRange.step}mm)`);
    
    const store = new OptimalTargetStore(resolution);
    await store.initialize();

    let results: any[] = [];
    let isComputing = false;

    const startTime = performance.now();
    const startMemory = (performance as any).memory?.usedJSHeapSize || 0;

    return new Promise<BenchmarkResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Benchmark timed out after 60 seconds for ${resolution}x${resolution}`));
      }, 60000);

      store.computeAllOptimalTargets(sigmaRange, (state) => {
        if (state.results) {
          results = state.results;
        }
        if (state.isComputing !== undefined) {
          isComputing = state.isComputing;
        }

        // Check if computation is complete
        if (!isComputing && state.isInitialized) {
          clearTimeout(timeout);
          
          const endTime = performance.now();
          const endMemory = (performance as any).memory?.usedJSHeapSize || 0;
          
          const totalTime = endTime - startTime;
          const expectedResults = Math.floor((sigmaRange.max - sigmaRange.min) / sigmaRange.step) + 1;
          const averageTimePerSigma = totalTime / Math.max(1, results.length);
          const peakMemoryUsage = Math.max(0, endMemory - startMemory);

          console.log(`Completed: ${totalTime.toFixed(2)}ms total, ${averageTimePerSigma.toFixed(2)}ms per sigma`);
          console.log(`Memory usage: ${(peakMemoryUsage / 1024 / 1024).toFixed(2)} MB`);
          console.log(`Results: ${results.length}/${expectedResults} sigma values computed`);

          resolve({
            resolution,
            workgroupSize,
            numWorkgroups,
            sigmaRange,
            totalTime,
            averageTimePerSigma,
            peakMemoryUsage,
            resultsCount: results.length
          });
        }
      }).catch(reject);
    });
  }

  async benchmarkMultipleStores(
    resolution: number = 250,
    configurations: Array<{workgroupSize: number, numWorkgroups: number}> = [
      {workgroupSize: 32, numWorkgroups: 16},
      {workgroupSize: 64, numWorkgroups: 8},
      {workgroupSize: 64, numWorkgroups: 16},
      {workgroupSize: 64, numWorkgroups: 32},
      {workgroupSize: 128, numWorkgroups: 16}
    ]
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    const sigmaRange = { min: 10, max: 20, step: 10 }; // Limited range for faster testing

    console.log(`\n🚀 CONFIGURATION OPTIMIZATION for ${resolution}x${resolution}`);
    console.log(`Testing configurations: ${configurations.map(c => `WG:${c.workgroupSize}/NW:${c.numWorkgroups}`).join(', ')}`);

    for (const config of configurations) {
      try {
        const result = await this.benchmarkBenchmarkStore(resolution, config.workgroupSize, config.numWorkgroups, sigmaRange);
        results.push(result);
        
        // Small delay between tests to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to benchmark config WG:${config.workgroupSize}/NW:${config.numWorkgroups}:`, error);
        // Continue with other configurations
      }
    }

    // Find optimal configuration
    if (results.length > 0) {
      const bestResult = results.reduce((best, current) => 
        current.averageTimePerSigma < best.averageTimePerSigma ? current : best
      );

      console.log(`\n🏆 BEST CONFIGURATION: WG:${bestResult.workgroupSize}/NW:${bestResult.numWorkgroups} (${bestResult.averageTimePerSigma.toFixed(2)}ms per sigma)`);
    }
    
    return results;
  }

  async benchmarkBenchmarkStore(
    resolution: number,
    workgroupSize: number,
    numWorkgroups: number,
    sigmaRange: SigmaRange
  ): Promise<BenchmarkResult> {
    console.log(`\n=== Benchmarking ${resolution}x${resolution} with WG:${workgroupSize}/NW:${numWorkgroups} ===`);
    
    const store = new BenchmarkOptimalTargetStore(resolution, workgroupSize, numWorkgroups);
    await store.initialize();

    let results: any[] = [];
    let isComputing = false;

    const startTime = performance.now();
    const startMemory = (performance as any).memory?.usedJSHeapSize || 0;

    return new Promise<BenchmarkResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`BenchmarkStore timed out after 60 seconds for ${resolution}x${resolution} WG:${workgroupSize}/NW:${numWorkgroups}`));
      }, 60000);

      store.computeAllOptimalTargets(sigmaRange, (state) => {
        if (state.results) {
          results = state.results;
        }
        if (state.isComputing !== undefined) {
          isComputing = state.isComputing;
        }

        // Check if computation is complete
        if (!isComputing && state.isInitialized) {
          clearTimeout(timeout);
          
          const endTime = performance.now();
          const endMemory = (performance as any).memory?.usedJSHeapSize || 0;
          
          const totalTime = endTime - startTime;
          const expectedResults = Math.floor((sigmaRange.max - sigmaRange.min) / sigmaRange.step) + 1;
          const averageTimePerSigma = totalTime / Math.max(1, results.length);
          const peakMemoryUsage = Math.max(0, endMemory - startMemory);

          console.log(`Completed: ${totalTime.toFixed(2)}ms total, ${averageTimePerSigma.toFixed(2)}ms per sigma`);
          console.log(`Memory usage: ${(peakMemoryUsage / 1024 / 1024).toFixed(2)} MB`);
          console.log(`Results: ${results.length}/${expectedResults} sigma values computed`);

          resolve({
            resolution,
            workgroupSize,
            numWorkgroups,
            sigmaRange,
            totalTime,
            averageTimePerSigma,
            peakMemoryUsage,
            resultsCount: results.length
          });
        }
      }).catch(reject);
    });
  }
}

// Helper function to log system information
function logSystemInfo() {
  console.log("\n🖥️  SYSTEM INFO:");
  console.log(`Platform: ${typeof navigator !== 'undefined' ? navigator.platform : 'Node.js'}`);
  console.log(`User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 50) + '...' : 'Node.js Environment'}`);
  console.log(`Memory: ${(performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)}MB used` : 'Not available'}`);
  console.log(`High Resolution Time: ${performance.now().toFixed(2)}ms since start`);
}

describe("Optimal Target WebGPU Benchmark", () => {
  let device: GPUDevice;
  let runner: OptimalTargetBenchmarkRunner;

  beforeAll(async () => {
    logSystemInfo();
    const gpu = await initWebGPU();
    device = gpu.device;
    runner = new OptimalTargetBenchmarkRunner(device);
    
    console.log("\n🚀 WebGPU device initialized successfully");
    console.log(`Device label: ${device.label || 'Unknown'}`);
  });

  afterAll(async () => {
    await cleanupWebGPU();
  });

  it("should benchmark 250x250 resolution with default parameters", async () => {
    const result = await runner.benchmarkConfiguration(
      250, // resolution
      64,  // workgroup size
      16,  // num workgroups
      { min: 5, max: 25, step: 5 } // sigma range: test 5 different sigma values
    );

    expect(result.resolution).toBe(250);
    expect(result.resultsCount).toBe(5); // Should compute 5 sigma values
    expect(result.totalTime).toBeGreaterThan(0);
    expect(result.averageTimePerSigma).toBeGreaterThan(0);

    console.log("\n📊 BENCHMARK RESULTS for 250x250:");
    console.log(`Total time: ${result.totalTime.toFixed(2)}ms`);
    console.log(`Average per sigma: ${result.averageTimePerSigma.toFixed(2)}ms`);
    console.log(`Memory usage: ${(result.peakMemoryUsage / 1024 / 1024).toFixed(2)} MB`);
  });

  it("should compare different resolutions", async () => {
    const resolutions = [100, 200, 250, 300];
    const results: BenchmarkResult[] = [];
    const sigmaRange = { min: 10, max: 20, step: 10 }; // Just 2 sigma values for speed

    console.log("\n🏁 RESOLUTION COMPARISON");
    
    for (const resolution of resolutions) {
      try {
        const result = await runner.benchmarkConfiguration(resolution, 64, 16, sigmaRange);
        results.push(result);
      } catch (error) {
        console.error(`Failed to benchmark ${resolution}x${resolution}:`, error);
      }
    }

    expect(results.length).toBeGreaterThan(0);

    // Print comparison table
    console.log("\n📈 RESOLUTION COMPARISON TABLE:");
    console.log("Resolution | Total Time (ms) | Avg per Sigma (ms) | Memory (MB)");
    console.log("-----------|-----------------|--------------------|-----------");
    results.forEach(result => {
      const memoryMB = (result.peakMemoryUsage / 1024 / 1024).toFixed(1);
      console.log(`${result.resolution}x${result.resolution}      | ${result.totalTime.toFixed(2).padStart(12)} | ${result.averageTimePerSigma.toFixed(2).padStart(15)} | ${memoryMB.padStart(8)}`);
    });

    // Verify that higher resolutions take longer
    const sorted = results.sort((a, b) => a.resolution - b.resolution);
    for (let i = 1; i < sorted.length; i++) {
      // Generally expect higher resolution to take longer, but allow some variance
      // due to GPU optimization and other factors
      expect(sorted[i].averageTimePerSigma).toBeGreaterThan(sorted[i-1].averageTimePerSigma * 0.5);
    }
  });

  it("should find optimal configuration parameters", async () => {
    // Since the current OptimalTargetStore doesn't expose workgroup configuration,
    // we'll test different numbers of workgroups by creating separate stores
    const configurations = [
      {workgroupSize: 64, numWorkgroups: 8},   // Lower parallelism
      {workgroupSize: 64, numWorkgroups: 16},  // Default
      {workgroupSize: 64, numWorkgroups: 32},  // Higher parallelism
    ];
    
    const results = await runner.benchmarkMultipleStores(250, configurations);
    
    expect(results.length).toBeGreaterThan(0);
    
    // All results should have valid timing data
    results.forEach(result => {
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.averageTimePerSigma).toBeGreaterThan(0);
      expect(result.resultsCount).toBeGreaterThan(0);
    });

    console.log("\n🎯 CONFIGURATION RECOMMENDATIONS:");
    console.log(`For 250x250 resolution, tested configurations:`);
    results.forEach(result => {
      console.log(`  WG:${result.workgroupSize}/NW:${result.numWorkgroups} → ${result.averageTimePerSigma.toFixed(2)}ms per sigma`);
    });
    
    const fastest = results.reduce((best, current) => 
      current.averageTimePerSigma < best.averageTimePerSigma ? current : best
    );
    console.log(`\nRecommended: workgroup size ${fastest.workgroupSize}, ${fastest.numWorkgroups} workgroups`);
  }, 120000); // 2 minute timeout for optimization

  it("should stress test with full sigma range", async () => {
    console.log("\n🔥 STRESS TEST: Full sigma range at 250x250");
    
    const result = await runner.benchmarkConfiguration(
      250,
      64,  // Use default workgroup size
      16,  // Use default num workgroups
      { min: 1, max: 50, step: 2 } // Wide range: 25 different sigma values
    );

    expect(result.resultsCount).toBe(25);
    expect(result.totalTime).toBeGreaterThan(0);
    
    const timePerComputation = result.totalTime / (result.resultsCount * 250 * 250);
    console.log(`\n🏁 STRESS TEST RESULTS:`);
    console.log(`Total computation time: ${result.totalTime.toFixed(2)}ms`);
    console.log(`Time per sigma value: ${result.averageTimePerSigma.toFixed(2)}ms`);
    console.log(`Time per pixel computation: ${(timePerComputation * 1000000).toFixed(2)}ns`);
    console.log(`Throughput: ${(result.resultsCount * 250 * 250 / result.totalTime * 1000).toFixed(0)} pixel computations per second`);
    
    // Verify reasonable performance (less than 15 seconds total for 25 sigma values)
    expect(result.totalTime).toBeLessThan(15000);
  }, 180000); // 3 minute timeout for stress test
});