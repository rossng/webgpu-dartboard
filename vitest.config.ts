import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
  assetsInclude: ["**/*.wgsl"],
  resolve: {
    alias: {
      "bundle-text:": "",
    },
  },
});
