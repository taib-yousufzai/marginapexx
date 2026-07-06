import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Make describe/it/expect available globally without explicit imports
    globals: true,
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
