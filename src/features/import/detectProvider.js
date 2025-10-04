// src/features/import/detectProvider.js

export function detectProvider(url) {
  try {
    const u = new URL(url);
    const host = u.hostname; // safer than .host (ignores port)

    if ((/youtube\.com|youtu\.be/).test(host) && (u.searchParams.get('list') || u.pathname.includes('/playlist'))) {
      return 'youtube';
    }
    if ((/open\.spotify\.com/).test(host) && u.pathname.startsWith('/playlist')) {
      return 'spotify';
    }
    if ((/soundcloud\.com/).test(host)) {
      return 'soundcloud';
    }
  } catch {
    // Invalid URL or parsing failed
  }
  return null;
}

// ✅ Provide a default export so `import detectProvider from '...'` works
export default detectProvider;
