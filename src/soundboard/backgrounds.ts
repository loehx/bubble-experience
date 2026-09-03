const BACKGROUND_STORAGE_KEY = 'bubble-experience-bg-index'

export const BACKGROUND_IMAGES = [
  new URL('./background.jpg', import.meta.url).href,
  new URL('./background-2.jpg', import.meta.url).href,
  new URL('./background-3.jpg', import.meta.url).href,
  new URL('./background-4.jpg', import.meta.url).href,
  new URL('./background-5.jpg', import.meta.url).href,
  new URL('./background-6.jpg', import.meta.url).href,
  new URL('./background-7.jpg', import.meta.url).href,
  new URL('./background-8.jpg', import.meta.url).href,
  new URL('./background-9.jpg', import.meta.url).href,
  new URL('./background-10.jpg', import.meta.url).href,
] as const

export const BACKGROUND_IMAGE_NAMES = [
  'background.jpg',
  'background-2.jpg',
  'background-3.jpg',
  'background-4.jpg',
  'background-5.jpg',
  'background-6.jpg',
  'background-7.jpg',
  'background-8.jpg',
  'background-9.jpg',
  'background-10.jpg',
] as const

export type BackgroundImage = (typeof BACKGROUND_IMAGES)[number]

export type BackgroundSelection = {
  src: BackgroundImage
  name: (typeof BACKGROUND_IMAGE_NAMES)[number]
}

/** Pick the next wallpaper in sequence (cycles on each page load). */
export function pickBackgroundImage(): BackgroundSelection {
  const count = BACKGROUND_IMAGES.length
  const stored = localStorage.getItem(BACKGROUND_STORAGE_KEY)
  const index =
    stored === null ? 0 : ((Number.parseInt(stored, 10) % count) + count) % count
  const next = (index + 1) % count
  localStorage.setItem(BACKGROUND_STORAGE_KEY, String(next))
  return {
    src: BACKGROUND_IMAGES[index],
    name: BACKGROUND_IMAGE_NAMES[index],
  }
}
