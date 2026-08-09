import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 1981,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
    },
  },
});
