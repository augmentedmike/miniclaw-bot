import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "src"),
      "@tools": path.resolve(__dirname, "src/tools"),
      "@telegram": path.resolve(__dirname, "src/telegram"),
      "@memory": path.resolve(__dirname, "src/memory"),
      "@web": path.resolve(__dirname, "src/web"),
      "@kb": path.resolve(__dirname, "src/kb"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "e2e/**/*.test.ts", "devtools/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
      ],
    },
  },
});
