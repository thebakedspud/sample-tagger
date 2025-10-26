import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'  // dY`^ note the .jsx
import { SpeedInsights } from '@vercel/speed-insights/react'
import { getFontPreference } from './utils/storage.js'

const initialFont = getFontPreference()
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-font', initialFont)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
      <SpeedInsights />
    </ThemeProvider>
  </StrictMode>,
)
