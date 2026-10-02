import { defineConfig } from 'vitest/config';
import { nativeHtmlPlugin } from './scripts/native-html.js';
import pkg from './package.json' with { type: 'json' };

// `--mode native` builds the web assets bundled into the Capacitor Android app
// (npm run build:native). It strips PWA-only tags; the web build is unchanged.
export default defineConfig(({ mode } = {}) => ({
  plugins: [mode === 'native' && nativeHtmlPlugin()],
  // Shown on the Settings screen ("Walkaholic v0.2.0").
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
