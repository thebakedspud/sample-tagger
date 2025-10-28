(() => {
  const FONT_KEY = 'sta:v6';
  const LEGACY_KEY = 'sta:v5';
  const FALLBACK = 'default';
  let font = FALLBACK;
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
    font = FALLBACK;
  }
  document.documentElement.setAttribute('data-font', font);
})();
