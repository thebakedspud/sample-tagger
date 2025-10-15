// src/components/TrackList.jsx
import { memo } from 'react'
import PropTypes from 'prop-types'

function TrackList({ tracks, onActivate, headingId = 'tracks-heading' }) {
  if (!tracks || tracks.length === 0) {
    return (
      <div className="card" aria-live="polite" data-testid="tracklist-empty">
        <p>No tracks to display.</p>
      </div>
    )
  }

  return (
    <section aria-labelledby={headingId} className="card" data-testid="tracklist">
      <h2 id={headingId} className="text-lg font-semibold mb-2">Imported tracks</h2>
      <ul className="note-list">
        {tracks.map((t) => (
          <li key={t.id} className="track-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="text-base" data-testid="track-title">{t.title || 'Untitled'}</div>
                <div className="text-sm" aria-label="Artist" data-testid="track-artist">
                  {t.artist || 'Unknown artist'}
                </div>
              </div>
              {t.sourceUrl ? (
                <a
                  href={t.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  aria-label={`Open ${t.title || 'track'} on source site`}
                >
                  Open
                </a>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => onActivate && onActivate(t)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && onActivate) {
                      e.preventDefault()
                      onActivate(t)
                    }
                  }}
                  aria-label={`Select ${t.title || 'track'}`}
                >
                  Select
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

TrackList.propTypes = {
  tracks: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string,
      artist: PropTypes.string,
      sourceUrl: PropTypes.string,
    })
  ),
  onActivate: PropTypes.func,
  headingId: PropTypes.string,
}

export default memo(TrackList)
