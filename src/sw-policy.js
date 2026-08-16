export const CACHE_FIRST = 'CACHE_FIRST';
export const STALE_WHILE_REVALIDATE = 'STALE_WHILE_REVALIDATE';
export const NETWORK_ONLY = 'NETWORK_ONLY';
export const SKIP = 'SKIP';

export function classifyRequestUrl(urlString, origin) {
  if (typeof urlString !== 'string' || urlString.trim() === '') {
    return SKIP;
  }
  if (typeof origin !== 'string') {
    return SKIP;
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return SKIP;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return SKIP;
  }

  const host = url.hostname;
  const path = url.pathname;

  if (host === 'googleapis.com' || host.endsWith('.googleapis.com')) {
    if (path.startsWith('/fitness/') || path.startsWith('/drive/')) {
      return NETWORK_ONLY;
    }
  }

  if (host === 'accounts.google.com' && path.includes('/gsi/')) {
    return STALE_WHILE_REVALIDATE;
  }

  if (url.origin === origin) {
    return CACHE_FIRST;
  }

  return SKIP;
}