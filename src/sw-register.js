export function createSwRegister({ nav, config = {}, log = console.error.bind(console, '[sw-register]') }) {
  return {
    async register() {
      if (!config.prod) {
        return;
      }
      if (!nav?.serviceWorker?.register) {
        return;
      }
      try {
        await nav.serviceWorker.register('/sw.js');
      } catch (err) {
        log(err);
      }
    },
  };
}