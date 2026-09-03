const SOUND_COUNT = 18

export const SPAWN_SOUND_SRC = new URL('./sounds/spawn.m4a', import.meta.url).href

export const SOUNDBOARD_SOUND_ENTRIES = Array.from({ length: SOUND_COUNT }, (_, index) => {
  const name = `${index + 1}.m4a`
  return {
    name,
    label: String(index + 1),
    src: new URL(`./sounds/${name}`, import.meta.url).href,
  }
}) as ReadonlyArray<{
  name: `${number}.m4a`
  label: string
  src: string
}>

export const SOUNDBOARD_SOUNDS = SOUNDBOARD_SOUND_ENTRIES.map((entry) => entry.src)

/** Playback weight overrides by sound number (1-based). Default weight is 1. */
export const SOUND_PLAY_WEIGHT_OVERRIDES: Partial<Record<number, number>> = {
  11: 2,
}

export function getSoundPlayWeight(soundNumber: number): number {
  return SOUND_PLAY_WEIGHT_OVERRIDES[soundNumber] ?? 1
}

export function pickWeightedSoundIndex(): number {
  const weights = SOUNDBOARD_SOUND_ENTRIES.map((entry) => getSoundPlayWeight(Number(entry.label)))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = Math.random() * totalWeight

  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 1
    roll -= weight
    if (roll < 0) return index
  }

  return Math.max(0, weights.length - 1)
}

export type SoundboardSound = (typeof SOUNDBOARD_SOUNDS)[number]
export type SoundboardSoundName = (typeof SOUNDBOARD_SOUND_ENTRIES)[number]['name']
