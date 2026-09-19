import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["api/test/**/*.test.ts"],
    environment: "node",
  },
});
