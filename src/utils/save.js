const KEY = 'virfly-session-v2'

export function loadSession() {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSession(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch {
    // Storage can be unavailable (private mode, quota); the session simply isn't kept.
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export function downloadText(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
