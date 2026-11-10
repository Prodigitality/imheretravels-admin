import { defineConfig } from "vitest/config";

// Firestore rules tests; run inside the emulator via `npm run test:rules`.
export default defineConfig({
  test: {
    include: ["firestore.rules.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
