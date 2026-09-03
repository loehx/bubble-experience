const SOUND_COUNT = 18

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

export type SoundboardSound = (typeof SOUNDBOARD_SOUNDS)[number]
export type SoundboardSoundName = (typeof SOUNDBOARD_SOUND_ENTRIES)[number]['name']
