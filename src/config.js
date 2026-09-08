const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;

// Fail-closed guard: validate CLIENT_ID is present and non-empty
if (!CLIENT_ID || (typeof CLIENT_ID === 'string' && CLIENT_ID.trim() === '')) {
  throw new Error(
    'Missing VITE_CLIENT_ID. Copy .env.example to .env.local and set it.'
  );
}

/** Default daily step goal used when no user-configured goal is stored. */
export const DEFAULT_STEP_GOAL = 10_000;

export { CLIENT_ID };
