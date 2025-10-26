// src/features/tags/TagChip.jsx
import PropTypes from 'prop-types'
import { forwardRef } from 'react'

const TagChip = forwardRef(function TagChip(props, ref) {
  const {
    tag,
    onRemove,
    onFilter,
    onClick,
    className = '',
    ...rest
  } = props || {}

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
})

TagChip.propTypes = {
  tag: PropTypes.string.isRequired,
  onRemove: PropTypes.func,
  onFilter: PropTypes.func,
  onClick: PropTypes.func,
  className: PropTypes.string,
}

export default TagChip
