// src/features/tags/TagInput.jsx
import PropTypes from 'prop-types';
import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getTagSuggestions, normalizeTag } from './tagUtils.js';

/**
 * @typedef {Object} TagInputProps
 * @property {string[]} [stockTags]
 * @property {string[]} [customTags]
 * @property {string[]} [existingTags]
 * @property {(tag: string) => boolean | { success?: boolean } | void} [onAdd]
 * @property {() => void} [onCancel]
 * @property {string} [placeholder]
 * @property {boolean} [autoFocus]
 * @property {string} [className]
 * @property {Record<string, unknown>} [rest]
 */

/**
 * @param {{
 *   stockTags?: string[];
 *   customTags?: string[];
 *   existingTags?: string[];
 *   onAdd?: (tag: string) => boolean | { success?: boolean } | void;
 *   onCancel?: () => void;
 *   placeholder?: string;
 *   autoFocus?: boolean;
 *   className?: string;
 *   [key: string]: unknown;
 * }} props
 * @param {import('react').Ref<HTMLInputElement>} ref
 */
/** @type {import('react').ForwardRefRenderFunction<HTMLInputElement, TagInputProps>} */
function TagInputInner(props, ref) {
  const safeProps = /** @type {TagInputProps} */ (props ?? {})
  const {
    stockTags,
    customTags,
    existingTags,
    onAdd,
    onCancel,
    placeholder = 'Add tag',
    autoFocus = false,
    className = '',
    ...restProps
  } = safeProps
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const inputRef = useRef(null);
  const mergedRef = useCallback(
    (node) => {
      inputRef.current = node;
      if (!ref) return;
      if (typeof ref === 'function') {
        ref(node);
      } else {
        ref.current = node;
      }
    },
    [ref],
  );

  const existingSet = useMemo(() => {
    if (!Array.isArray(existingTags)) return new Set();
    return new Set(existingTags.map((tag) => normalizeTag(tag)).filter(Boolean));
  }, [existingTags]);

  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const suggestions = useMemo(
    () =>
      getTagSuggestions(query, {
        stock: stockTags,
        custom: customTags,
        exclude: Array.from(existingSet),
      }),
    [query, stockTags, customTags, existingSet],
  );

  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  useEffect(() => {
    if (suggestions.length === 0) {
      if (highlightIndex !== -1) {
        setHighlightIndex(-1);
      }
      return;
    }
    if (highlightIndex === -1 || highlightIndex >= suggestions.length) {
      setHighlightIndex(0);
    }
  }, [suggestions, highlightIndex]);

  const handleAdd = (rawTag) => {
    const normalized = normalizeTag(rawTag);
    if (!normalized) return;
    const result = onAdd ? onAdd(normalized) : true;
    let succeeded = result !== false;
    if (typeof result === 'object' && result !== null) {
      succeeded = result.success !== false;
    }
    if (succeeded) {
      setQuery('');
      setHighlightIndex(-1);
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setHighlightIndex((prev) => {
        if (prev === -1) return 0;
        return (prev + 1) % suggestions.length;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setHighlightIndex((prev) => {
        if (prev <= 0) return suggestions.length - 1;
        return prev - 1;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        handleAdd(suggestions[highlightIndex]);
      } else {
        handleAdd(query);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setQuery('');
      setHighlightIndex(-1);
      if (onCancel) onCancel();
    }
  };

  const activeOptionId =
    highlightIndex >= 0 && highlightIndex < suggestions.length
      ? `${listboxId}-option-${highlightIndex}`
      : undefined;

  return (
    <div className={`tag-input ${className}`.trim()}>
      <input
        {...restProps}
        ref={mergedRef}
        id={inputId}
        type="text"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;
          if (!nextFocus) {
            if (onCancel) onCancel();
            return;
          }
          const container = event.currentTarget.parentElement;
          if (!container || !container.contains(nextFocus)) {
            if (onCancel) onCancel();
          }
        }}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={suggestions.length > 0}
        aria-activedescendant={activeOptionId}
        className="tag-input__field"
      />
      {suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="tag-input__suggestions"
        >
          {suggestions.map((tag, index) => (
            <li
              key={tag}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={highlightIndex === index}
              className={
                highlightIndex === index
                  ? 'tag-input__option tag-input__option--active'
                  : 'tag-input__option'
              }
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleAdd(tag)}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TagInput = forwardRef(TagInputInner);

TagInput.propTypes = {
  stockTags: PropTypes.arrayOf(PropTypes.string),
  customTags: PropTypes.arrayOf(PropTypes.string),
  existingTags: PropTypes.arrayOf(PropTypes.string),
  onAdd: PropTypes.func,
  onCancel: PropTypes.func,
  placeholder: PropTypes.string,
  autoFocus: PropTypes.bool,
  className: PropTypes.string,
};

export default TagInput;
