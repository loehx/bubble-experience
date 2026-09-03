export const CURSOR_FRAMES = [
  new URL('./cursor/1.png', import.meta.url).href,
  new URL('./cursor/2.png', import.meta.url).href,
  new URL('./cursor/3.png', import.meta.url).href,
  new URL('./cursor/4.png', import.meta.url).href,
] as const

export type CursorFrame = (typeof CURSOR_FRAMES)[number]
