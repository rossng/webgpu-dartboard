#!/usr/bin/env ts-node
import { OptimalTargetStore, SigmaRange } from "./OptimalTargetStore";
import { initWebGPU, cleanupWebGPU } from "../test/webgpu-setup";

interface BenchmarkConfig {
  resolution: number;
  sigmaRange: SigmaRange;
  name: string;
}

async function runBenchmark(config: BenchmarkConfig): Promise<void> {
  console.log(`\n🚀 Running benchmark: ${config.name}`);
  console.log(`Resolution: ${config.resolution}x${config.resolution}`);
  console.log(`Sigma range: ${config.sigmaRange.min}-${config.sigmaRange.max}mm (step: ${config.sigmaRange.step}mm)`);
  
  const expectedResults = Math.floor((config.sigmaRange.max - config.sigmaRange.min) / config.sigmaRange.step) + 1;
  console.log(`Expected sigma values to compute: ${expectedResults}`);
  
  const store = new OptimalTargetStore(config.resolution);
  await store.initialize();
  
  let results: any[] = [];
  let isComputing = false;
  let isInitialized = false;
  
  const startTime = performance.now();
  const startMemory = (performance as any).memory?.usedJSHeapSize || 0;
  
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Benchmark ${config.name} timed out after 5 minutes`));
    }, 5 * 60 * 1000); // 5 minute timeout
    
    store.computeAllOptimalTargets(config.sigmaRange, (state) => {
      if (state.results) {
        results = state.results;
        if (results.length > 0) {
          const progress = (results.length / expectedResults * 100).toFixed(1);
          console.log(`  Progress: ${results.length}/${expectedResults} sigma values (${progress}%)`);
        }
      }
      
      if (state.isComputing !== undefined) {
        isComputing = state.isComputing;
      }
      
      if (state.isInitialized !== undefined) {
        isInitialized = state.isInitialized;
      }
      
      if (!isComputing && isInitialized) {
        clearTimeout(timeout);
        
        const endTime = performance.now();
        const endMemory = (performance as any).memory?.usedJSHeapSize || 0;
        
        const totalTime = endTime - startTime;
        const averageTimePerSigma = totalTime / Math.max(1, results.length);
        const peakMemoryUsage = Math.max(0, endMemory - startMemory);
        
        console.log(`\n✅ ${config.name} completed:`);
        console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
        console.log(`  Average per sigma: ${averageTimePerSigma.toFixed(2)}ms`);
        console.log(`  Memory usage: ${(peakMemoryUsage / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Results computed: ${results.length}/${expectedResults}`);
        console.log(`  Throughput: ${(results.length * config.resolution * config.resolution / totalTime * 1000).toFixed(0)} pixel computations/second`);
        
        // Log some sample results
        if (results.length > 0) {
          console.log(`  Sample results:`);
          const samples = [0, Math.floor(results.length / 2), results.length - 1].filter(i => i < results.length);
          samples.forEach(i => {
            const result = results[i];
            console.log(`    σ=${result.sigma}mm → (${result.x.toFixed(1)}, ${result.y.toFixed(1)})`);
          });
        }
        
        resolve();
      }
    }).catch(reject);
  });
}

async function main() {
  console.log("🎯 WebGPU Optimal Target Benchmark Suite");
  console.log("=========================================");
  
  try {
    // Initialize WebGPU
    const gpu = await initWebGPU();
    console.log(`WebGPU device initialized: ${gpu.device.label || 'Unknown device'}`);
    
    // Define benchmark configurations
    const benchmarks: BenchmarkConfig[] = [
      {
        name: "Quick Test (250x250)",
        resolution: 250,
        sigmaRange: { min: 10, max: 20, step: 10 } // 2 sigma values
      },
      {
        name: "Medium Test (250x250)",
        resolution: 250,
        sigmaRange: { min: 5, max: 25, step: 5 } // 5 sigma values
      },
      {
        name: "Full Range Test (250x250)",
        resolution: 250,
        sigmaRange: { min: 1, max: 50, step: 2 } // 25 sigma values
      },
      {
        name: "High Resolution Test (400x400)",
        resolution: 400,
        sigmaRange: { min: 10, max: 30, step: 10 } // 3 sigma values
      },
      {
        name: "Low Resolution Test (100x100)",
        resolution: 100,
        sigmaRange: { min: 5, max: 25, step: 5 } // 5 sigma values
      }
    ];
    
    // Run benchmarks sequentially
    for (const benchmark of benchmarks) {
      try {
        await runBenchmark(benchmark);
        
        // Small delay between benchmarks for cleanup
        console.log("  Waiting for cleanup...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Benchmark ${benchmark.name} failed:`, error);
      }
    }
    
    console.log("\n🏁 All benchmarks completed!");
    
  } catch (error) {
    console.error("❌ Benchmark suite failed:", error);
  } finally {
    await cleanupWebGPU();
    console.log("🧹 WebGPU resources cleaned up");
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Benchmark interrupted');
  await cleanupWebGPU();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught exception:', error);
  await cleanupWebGPU();
  process.exit(1);
});

if (require.main === module) {
  main().catch(console.error);
}