import { useEffect, useId, useState } from 'react'
import { getFontPreference, setFontPreference } from '../../utils/storage.js'

const OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'system', label: 'Match system' },
  { value: 'dyslexic', label: 'Dyslexic friendly' },
]

export default function FontSettings() {
  const groupId = useId()
  const [selected, setSelected] = useState(() => getFontPreference())

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-font', selected)
    }
  }, [selected])

  function handleChange(event) {
    const value = event.target.value
    const next = setFontPreference(value)
    setSelected(next)
  }

  return (
    <fieldset className="font-settings" aria-labelledby={`${groupId}-legend`}>
      <legend id={`${groupId}-legend`} className="sr-only">
        Font preference
      </legend>
      <div className="font-settings-options">
        {OPTIONS.map((option) => {
          const isActive = selected === option.value
          const inputId = `${groupId}-${option.value}`
          return (
            <div key={option.value} className={`font-option${isActive ? ' is-selected' : ''}`}>
              <input
                id={inputId}
                type="radio"
                name="font-preference"
                value={option.value}
                checked={isActive}
                onChange={handleChange}
              />
              <label className="font-option-card" htmlFor={inputId}>
                <span className="font-option-sample" aria-hidden="true">
                  Aa
                </span>
                <span className="font-option-label">{option.label}</span>
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
