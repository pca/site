export type AdminTheme = "light" | "dark"

const STORAGE_KEY = "pca-admin-theme"

export function getInitialAdminTheme(): AdminTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    // A blocked storage area should not prevent the dashboard from loading.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyAdminTheme(theme: AdminTheme, persist = false) {
  document.documentElement.dataset.adminTheme = theme
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // The switch still works for this page when storage is unavailable.
    }
  }
}
