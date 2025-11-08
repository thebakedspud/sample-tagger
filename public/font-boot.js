(() => {
  const FONT_KEY = 'sta:v6';
  const LEGACY_KEY = 'sta:v5';
  const FALLBACK = 'default';
  let font = FALLBACK;

  // Only attempt to read from localStorage in real browser environments.
  // Accessing `localStorage` directly can throw in some environments
  // (server-side rendering, restricted iframes, or privacy modes), so
  // guard with a feature check first.
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    try {
      const raw = localStorage.getItem(FONT_KEY) ?? localStorage.getItem(LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const candidate = parsed?.uiPrefs?.font;
        if (candidate === 'system' || candidate === 'dyslexic' || candidate === 'default') {
          font = candidate;
        }
      }
    } catch {
      // If parsing or access fails, fall back to the default font.
      font = FALLBACK;
    }
  }
  document.documentElement.setAttribute('data-font', font);
})();
