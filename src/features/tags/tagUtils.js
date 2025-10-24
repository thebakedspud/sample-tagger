// src/features/tags/tagUtils.js
// Utilities shared by the tagging UI.

/**
 * Normalize a raw tag by trimming whitespace and lowercasing.
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  if (typeof tag !== 'string') return '';
  const trimmed = tag.trim().toLowerCase();
  return trimmed;
}

/**
 * Produce a normalized, de-duped list of suggestions using stock + custom tags.
 * Stock tags are preserved in their given order, followed by custom tags.
 * Existing tags are filtered out; query matching prioritises prefix matches.
 *
 * @param {string} query
 * @param {{ stock?: string[], custom?: string[], exclude?: string[] }} sources
 * @returns {string[]}
 */
export function getTagSuggestions(query, sources = {}) {
  const stock = Array.isArray(sources.stock) ? sources.stock : [];
  const custom = Array.isArray(sources.custom) ? sources.custom : [];
  const exclude = Array.isArray(sources.exclude) ? sources.exclude : [];

  const normalizedQuery = normalizeTag(query);
  const excludeSet = new Set(exclude.map((tag) => normalizeTag(tag)).filter(Boolean));
  /** @type {string[]} */
  const combined = [];
  /** @type {Set<string>} */
  const seen = new Set();

  const pushTag = (tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized) || excludeSet.has(normalized)) return;
    seen.add(normalized);
    combined.push(normalized);
  };

  stock.forEach(pushTag);
  custom.forEach(pushTag);

  if (!normalizedQuery) {
    return combined;
  }

  const prefixMatches = combined.filter((tag) => tag.startsWith(normalizedQuery));
  if (prefixMatches.length > 0) {
    return prefixMatches;
  }

  return combined.filter((tag) => tag.includes(normalizedQuery));
}

