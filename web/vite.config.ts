import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/DeepX/" : "/",
  plugins: [react()],
  build: { target: "es2022", sourcemap: true },
  test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
