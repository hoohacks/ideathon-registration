import { defineConfig } from "vitest/config";

/**
 * The rules suite runs under vitest rather than `react-scripts test`.
 *
 * Three things make it impossible to run inside CRA's jest: CRA pins
 * `testEnvironment: "jsdom"` and does not allow overriding it from
 * package.json; under jsdom `firebase/database` resolves to the browser build,
 * while @firebase/rules-unit-testing drives the emulator's admin endpoints from
 * Node; and the emulator has to wrap the test command, which rules out the
 * default interactive watch mode.
 *
 * The two runners never see each other's files: CRA's jest only looks under
 * src/, and this only looks under test/rules/.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/rules/**/*.test.mjs"],
    // every file talks to the same emulator namespace and calls clearDatabase
    // between tests, so they must not run concurrently
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
