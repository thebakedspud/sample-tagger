// src/features/tags/TagChip.jsx
import PropTypes from 'prop-types'
import { forwardRef } from 'react'

/**
 * @typedef {Object} TagChipProps
 * @property {string} tag
 * @property {(tag: string) => void} [onRemove]
 * @property {(tag: string) => void} [onFilter]
 * @property {(event: import('react').MouseEvent<HTMLButtonElement>) => void} [onClick]
 * @property {string} [className]
 * @property {Record<string, unknown>} [rest]
 */

/**
 * @param {{
 *   tag: string;
 *   onRemove?: (tag: string) => void;
 *   onFilter?: (tag: string) => void;
 *   onClick?: (event: import('react').MouseEvent<HTMLButtonElement>) => void;
 *   className?: string;
 *   [key: string]: unknown;
 * }} props
 * @param {import('react').Ref<HTMLButtonElement>} ref
 */
/** @type {import('react').ForwardRefRenderFunction<HTMLButtonElement, TagChipProps>} */
function TagChipInner(props, ref) {
  const safeProps = /** @type {TagChipProps} */ (props ?? {})
  const {
    tag,
    onRemove,
    onFilter,
    onClick,
    className = '',
    ...rest
  } = safeProps

  const handleClick = (event) => {
    if (onClick) {
      onClick(event);
    }
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (onFilter) {
      onFilter(tag);
    }
    if (onRemove) {
      onRemove(tag);
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`tag-chip ${className}`.trim()}
      aria-pressed="true"
      aria-label={`Remove tag ${tag}`}
      title={`Remove tag ${tag}`}
      onClick={handleClick}
      {...rest}
    >
      <span className="tag-chip__label">{tag}</span>
      <span aria-hidden="true" className="tag-chip__remove">{'\u00d7'}</span>
    </button>
  )
}

const TagChip = forwardRef(TagChipInner)

TagChip.propTypes = {
  tag: PropTypes.string.isRequired,
  onRemove: PropTypes.func,
  onFilter: PropTypes.func,
  onClick: PropTypes.func,
  className: PropTypes.string,
}

export default TagChip
