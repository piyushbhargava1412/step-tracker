const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;

// Fail-closed guard: validate CLIENT_ID is present and non-empty
if (!CLIENT_ID || (typeof CLIENT_ID === 'string' && CLIENT_ID.trim() === '')) {
  throw new Error(
    'Missing VITE_CLIENT_ID. Copy .env.example to .env.local and set it.'
  );
}

export { CLIENT_ID };
