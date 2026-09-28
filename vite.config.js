import { defineConfig } from 'vitest/config';
import { nativeHtmlPlugin } from './scripts/native-html.js';

// `--mode native` builds the web assets bundled into the Capacitor Android app
// (npm run build:native). It strips PWA-only tags; the web build is unchanged.
export default defineConfig(({ mode } = {}) => ({
  plugins: [mode === 'native' && nativeHtmlPlugin()],
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
}));
