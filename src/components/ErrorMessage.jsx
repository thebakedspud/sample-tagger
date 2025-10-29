import PropTypes from 'prop-types'

export default function ErrorMessage({ children, id, className = '' }) {
  if (!children) return null

  return (
    <div
      id={id}
      role="alert"
      className={`error-message ${className}`.trim()}
    >
      {children}
    </div>
  )
}

ErrorMessage.propTypes = {
  children: PropTypes.node,
  id: PropTypes.string,
  className: PropTypes.string,
}
