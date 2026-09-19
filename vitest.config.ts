import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["api/test/**/*.test.ts", "collector/test/**/*.test.js"],
    environment: "node",
  },
});
