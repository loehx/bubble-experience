/** Motion language durations in seconds (Motion / CSS). */
export const motionDuration = {
  micro: 0.2,
  standard: 0.4,
  emphasis: 0.8,
  hero: 1.2,
} as const

export type MotionDuration = keyof typeof motionDuration
