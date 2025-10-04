// src/components/LiveRegion.jsx
export default function LiveRegion({ message }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ position: 'absolute', left: '-9999px' }}
    >
      {message || ''}
    </div>
  )
}
