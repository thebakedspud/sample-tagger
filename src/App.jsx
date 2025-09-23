export default function App() {
  return (
    <div style={{ maxWidth: 720, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
      <h1 style={{ marginBottom: 16 }}>Sample Tagger</h1>
      <p style={{ marginBottom: 24 }}>
        Load a Spotify / YouTube / SoundCloud playlist to start adding notes.
      </p>
      <button
        style={{
          fontSize: 16,
          padding: '12px 20px',
          cursor: 'pointer',
          borderRadius: 8,
          border: '1px solid #ccc',
        }}
        onClick={() => alert('Import flow will go here')}
      >
        Import Playlist
      </button>
    </div>
  )
}
