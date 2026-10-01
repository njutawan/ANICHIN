// Global test setup for Vitest.
// Registers jest-dom matchers (e.g. toBeInTheDocument) onto Vitest's expect.
// Side-effect only, so it is safe for node-env test files as well.
import '@testing-library/jest-dom/vitest';
