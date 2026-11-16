import { useState } from "react"

import { applyAdminTheme, getInitialAdminTheme } from "../lib/theme"

export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialAdminTheme)
  const dark = theme === "dark"

  return (
    <button
      type="button"
      className="admin-theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      onClick={() => {
        const next = dark ? "light" : "dark"
        applyAdminTheme(next, true)
        setTheme(next)
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M20.5 13.3A8.5 8.5 0 0 1 10.7 3.5a8.5 8.5 0 1 0 9.8 9.8Z" />
      </svg>
      <span>Dark mode</span>
      <span className="admin-theme-state" aria-hidden="true">{dark ? "On" : "Off"}</span>
    </button>
  )
}
