const loggedKeys = new Set()

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.round(performance.now())
  }
  return Date.now()
}

export function logStartup(label, detail = {}) {
  console.info(`[gupt-startup] ${label}`, {
    t: `${nowMs()}ms`,
    ...detail,
  })
}

export function logStartupOnce(key, label, detail = {}) {
  if (loggedKeys.has(key)) return
  loggedKeys.add(key)
  logStartup(label, detail)
}
