const STYLE_ID = 'soundboard-system-cursor-hide'
const TRANSPARENT_CURSOR =
  'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), none'

let lockCount = 0

function cursorCss() {
  return `
    *, *::before, *::after {
      cursor: ${TRANSPARENT_CURSOR} !important;
    }
    html, body {
      cursor: none !important;
    }
  `
}

export function lockSystemCursor() {
  lockCount += 1
  if (lockCount > 1) return

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = cursorCss()

  document.documentElement.style.setProperty('cursor', 'none', 'important')
  document.body.style.setProperty('cursor', 'none', 'important')
}

export function unlockSystemCursor() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0) return

  document.getElementById(STYLE_ID)?.remove()
  document.documentElement.style.removeProperty('cursor')
  document.body.style.removeProperty('cursor')
}

export function reinforceSystemCursorHidden() {
  if (lockCount === 0) return
  document.documentElement.style.setProperty('cursor', 'none', 'important')
  document.body.style.setProperty('cursor', 'none', 'important')
}

export function hideCursorOnElement(element: HTMLElement | null | undefined) {
  if (!element) return
  element.style.setProperty('cursor', 'none', 'important')
}

export async function requestStagePointerLock(element: HTMLElement) {
  if (document.pointerLockElement === element) return true
  try {
    await element.requestPointerLock()
    return document.pointerLockElement === element
  } catch {
    return false
  }
}

export function releaseStagePointerLock() {
  if (document.pointerLockElement) {
    document.exitPointerLock()
  }
}
