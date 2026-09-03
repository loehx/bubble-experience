import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { motionDuration } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'react-router-dom'
import { CURSOR_FRAMES } from './cursor'
import {
  hideCursorOnElement,
  lockSystemCursor,
  reinforceSystemCursorHidden,
  unlockSystemCursor,
} from './hideSystemCursor'
import { pickBackgroundImage } from './backgrounds'
import { SOUNDBOARD_SOUND_ENTRIES, pickWeightedSoundIndex, SPAWN_SOUND_SRC } from './sounds'

const CURSOR_SIZE_REM = 7
const BACKGROUND_COVER_SCALE = 1.05
const BUBBLE_REFRACTION_MAG = 1.28
const BUBBLE_REFRACTION_WARP = 0.52

export interface SoundboardProps {
  /** Number of live bubbles on screen. */
  bubbleCount?: number
  /** Multiplier for rise speed (1 = default, very slow). */
  riseSpeed?: number
  /** Show a small interaction hint overlay. */
  showHint?: boolean
  className?: string
}

interface BubbleState {
  id: string
  x: number
  y: number
  radius: number
  riseSpeed: number
  swayAmplitude: number
  swayPhase: number
  hue: number
  /** When set, the bubble grows from small to `radius` over time and cannot be popped until fully grown. */
  spawnedAt?: number
}

const BUBBLE_GROW_DURATION_MS = 3000
const BUBBLE_SPAWN_SCALE = 0.12

interface BurstState {
  id: string
  x: number
  y: number
  radius: number
  hue: number
}

interface PointerCoords {
  x: number
  y: number
  active: boolean
}

let bubbleIdCounter = 0

function nextBubbleId() {
  bubbleIdCounter += 1
  return `bubble-${bubbleIdCounter}`
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function createBubble(width: number, height: number, riseMultiplier: number): BubbleState {
  const radius = randomBetween(22, 58)
  return {
    id: nextBubbleId(),
    x: randomBetween(radius, Math.max(radius + 1, width - radius)),
    y: height + randomBetween(radius, height * 0.45),
    radius,
    riseSpeed: randomBetween(10, 24) * riseMultiplier,
    swayAmplitude: randomBetween(6, 22),
    swayPhase: randomBetween(0, Math.PI * 2),
    hue: randomBetween(180, 320),
  }
}

/** Initial load: bubbles scattered across the full viewport. */
function createBubbleScattered(
  width: number,
  height: number,
  riseMultiplier: number,
): BubbleState {
  const radius = randomBetween(22, 58)
  return {
    id: nextBubbleId(),
    x: randomBetween(radius, Math.max(radius + 1, width - radius)),
    y: randomBetween(radius, Math.max(radius + 1, height - radius)),
    radius,
    riseSpeed: randomBetween(10, 24) * riseMultiplier,
    swayAmplitude: randomBetween(6, 22),
    swayPhase: randomBetween(0, Math.PI * 2),
    hue: randomBetween(180, 320),
  }
}

function remToPx(rem: number) {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return rem * (Number.isFinite(root) ? root : 16)
}

const INTRO_LINES = ['START', 'THE', 'EXPERIENCE'] as const
const INTRO_LETTER_BASE_DELAY_S = 0.2
const INTRO_LETTER_STEP_S = 0.02
const INTRO_LETTER_DURATION_S = 1.5
const INTRO_LETTER_EASE: [number, number, number, number] = [0, 1, 0.3, 1]

const INTRO_LINE_LETTERS = INTRO_LINES.map((line, lineIndex) => {
  const startIndex = INTRO_LINES.slice(0, lineIndex).reduce((sum, entry) => sum + entry.length, 0)
  return {
    line,
    letters: [...line].map((char, charIndex) => ({
      char,
      globalIndex: startIndex + charIndex,
    })),
  }
})

function IntroLetterReveal({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <span className="pointer-events-none text-center text-4xl font-bold uppercase leading-[0.8em] tracking-[-0.08em] text-white opacity-70 transition-opacity group-hover:opacity-100 md:text-6xl lg:text-7xl">
      {INTRO_LINE_LETTERS.map(({ line, letters }) => (
        <span key={line} className="block overflow-hidden whitespace-nowrap">
          <span className="inline-block whitespace-nowrap">
            {letters.map(({ char, globalIndex }) => (
              <span
                key={`${line}-${globalIndex}`}
                className="inline-block overflow-hidden align-top -m-[0.1em] p-[0.1em]"
              >
                <motion.span
                  className="inline-block"
                  initial={{ y: reduceMotion ? 0 : '-115%' }}
                  animate={{ y: 0 }}
                  transition={{
                    duration: reduceMotion ? 0 : INTRO_LETTER_DURATION_S,
                    ease: INTRO_LETTER_EASE,
                    delay: reduceMotion
                      ? 0
                      : INTRO_LETTER_BASE_DELAY_S + globalIndex * INTRO_LETTER_STEP_S,
                  }}
                >
                  {char}
                </motion.span>
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

function createBubbleAt(
  x: number,
  y: number,
  width: number,
  height: number,
  riseMultiplier: number,
): BubbleState {
  const radius = randomBetween(16, 40)
  return {
    id: nextBubbleId(),
    x: Math.min(Math.max(x + randomBetween(-52, 52), radius), Math.max(radius, width - radius)),
    y: Math.min(Math.max(y + randomBetween(-40, 40), radius), Math.max(radius, height - radius)),
    radius,
    riseSpeed: randomBetween(12, 26) * riseMultiplier,
    swayAmplitude: randomBetween(4, 16),
    swayPhase: randomBetween(0, Math.PI * 2),
    hue: randomBetween(180, 320),
    spawnedAt: performance.now(),
  }
}

function bubbleCanPop(bubble: BubbleState, time: number) {
  if (bubble.spawnedAt === undefined) return true
  return time - bubble.spawnedAt >= BUBBLE_GROW_DURATION_MS
}

function bubbleVisualRadius(bubble: BubbleState, time: number) {
  if (bubble.spawnedAt === undefined) return bubble.radius

  const elapsed = time - bubble.spawnedAt
  if (elapsed >= BUBBLE_GROW_DURATION_MS) return bubble.radius

  const progress = elapsed / BUBBLE_GROW_DURATION_MS
  const eased = 1 - (1 - progress) ** 3
  const minRadius = Math.max(4, bubble.radius * BUBBLE_SPAWN_SCALE)
  return minRadius + (bubble.radius - minRadius) * eased
}

function bubbleVisualPosition(bubble: BubbleState, time: number) {
  const sway =
    Math.sin(time * 0.00045 + bubble.swayPhase) * bubble.swayAmplitude +
    Math.sin(time * 0.00018 + bubble.swayPhase * 1.7) * bubble.swayAmplitude * 0.35
  return { x: bubble.x + sway, y: bubble.y }
}

function drawBackgroundCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
) {
  const source = image as HTMLImageElement | HTMLCanvasElement
  const imageWidth =
    'naturalWidth' in source && source.naturalWidth > 0
      ? source.naturalWidth
      : 'width' in source
        ? source.width
        : width
  const imageHeight =
    'naturalHeight' in source && source.naturalHeight > 0
      ? source.naturalHeight
      : 'height' in source
        ? source.height
        : height

  if (!imageWidth || !imageHeight) return

  const viewRatio = width / height
  const imageRatio = imageWidth / imageHeight
  let cropX = 0
  let cropY = 0
  let cropWidth = imageWidth
  let cropHeight = imageHeight

  if (imageRatio > viewRatio) {
    cropWidth = imageHeight * viewRatio
    cropX = (imageWidth - cropWidth) / 2
  } else {
    cropHeight = imageWidth / viewRatio
    cropY = (imageHeight - cropHeight) / 2
  }

  const drawWidth = width * BACKGROUND_COVER_SCALE
  const drawHeight = height * BACKGROUND_COVER_SCALE
  const offsetX = (width - drawWidth) / 2
  const offsetY = (height - drawHeight) / 2

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
  )
}

function drawBubbleRefraction(
  ctx: CanvasRenderingContext2D,
  background: CanvasImageSource,
  x: number,
  y: number,
  radius: number,
  simplified: boolean,
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.clip()

  if (simplified) {
    const sampleSize = (radius * 2) / BUBBLE_REFRACTION_MAG
    ctx.drawImage(
      background,
      x - sampleSize / 2,
      y - sampleSize / 2,
      sampleSize,
      sampleSize,
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
    )
    ctx.restore()
    return
  }

  const strips = Math.min(22, Math.max(10, Math.floor(radius / 2.2)))

  for (let strip = 0; strip < strips; strip += 1) {
    const t0 = strip / strips
    const t1 = (strip + 1) / strips
    const destY = y - radius + t0 * radius * 2
    const destHeight = (t1 - t0) * radius * 2
    const midY = destY + destHeight / 2
    const ny = (midY - y) / radius
    const edge = Math.sqrt(Math.max(0, 1 - ny * ny))
    const destHalfWidth = radius * edge

    if (destHalfWidth < 0.75) continue

    const lens = 1 - edge
    const warpOffset = lens * lens * BUBBLE_REFRACTION_WARP * radius
    const sampleHalfWidth = destHalfWidth / BUBBLE_REFRACTION_MAG
    const sampleHeight = destHeight / BUBBLE_REFRACTION_MAG

    ctx.drawImage(
      background,
      x - sampleHalfWidth - warpOffset * Math.sign(ny || 1),
      midY - sampleHeight / 2,
      sampleHalfWidth * 2,
      sampleHeight,
      x - destHalfWidth,
      destY,
      destHalfWidth * 2,
      destHeight,
    )
  }

  ctx.restore()
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  background: CanvasImageSource | null,
  x: number,
  y: number,
  radius: number,
  hue: number,
  immune: boolean,
  simplifiedRefraction: boolean,
) {
  if (background) {
    drawBubbleRefraction(ctx, background, x, y, radius, simplifiedRefraction)

    const edgeShade = ctx.createRadialGradient(x, y, radius * 0.68, x, y, radius)
    edgeShade.addColorStop(0, 'rgba(0,0,0,0)')
    edgeShade.addColorStop(0.82, 'rgba(0,0,0,0.08)')
    edgeShade.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = edgeShade
    ctx.fill()
    ctx.restore()
  }

  const gradient = ctx.createRadialGradient(
    x - radius * 0.28,
    y - radius * 0.32,
    radius * 0.05,
    x,
    y,
    radius,
  )
  gradient.addColorStop(0, immune ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.3)')
  gradient.addColorStop(0.18, immune ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)')
  gradient.addColorStop(0.42, `hsla(${hue}, 72%, 68%, ${immune ? 0.1 : 0.16})`)
  gradient.addColorStop(0.72, `hsla(${hue}, 55%, 42%, ${immune ? 0.04 : 0.06})`)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.strokeStyle = immune ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.38)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  if (!immune) {
    ctx.beginPath()
    ctx.arc(x - radius * 0.22, y - radius * 0.26, radius * 0.12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.fill()
  }
  ctx.restore()
}

function useAudioPool() {
  const poolRef = useRef<HTMLAudioElement[] | null>(null)
  const spawnAudioRef = useRef<HTMLAudioElement | null>(null)
  const unlockedRef = useRef(false)

  const unlock = useCallback(() => {
    if (unlockedRef.current) return
    unlockedRef.current = true
    poolRef.current = SOUNDBOARD_SOUND_ENTRIES.map((entry) => {
      const audio = new Audio(entry.src)
      audio.preload = 'auto'
      return audio
    })
    const spawnAudio = new Audio(SPAWN_SOUND_SRC)
    spawnAudio.preload = 'auto'
    spawnAudio.loop = true
    spawnAudioRef.current = spawnAudio
    // Satisfy autoplay policy: play+pause a silent tick on first gesture.
    const primer = poolRef.current[0]
    if (primer) {
      primer.volume = 1
      void primer.play().then(() => {
        primer.pause()
        primer.currentTime = 0
      }).catch(() => {})
    }
  }, [])

  const playRandom = useCallback((): string | null => {
    unlock()
    const pool = poolRef.current
    if (!pool?.length) return null
    const index = pickWeightedSoundIndex()
    const clip = pool[index]
    const entry = SOUNDBOARD_SOUND_ENTRIES[index]
    if (!entry) return null
    clip.currentTime = 0
    void clip.play().catch(() => {})
    return entry.label
  }, [unlock])

  const playSound = useCallback(
    (index: number): string | null => {
      unlock()
      const pool = poolRef.current
      if (!pool?.length || index < 0 || index >= pool.length) return null
      const clip = pool[index]
      const entry = SOUNDBOARD_SOUND_ENTRIES[index]
      if (!entry) return null
      clip.currentTime = 0
      void clip.play().catch(() => {})
      return entry.label
    },
    [unlock],
  )

  const startSpawnLoop = useCallback(() => {
    unlock()
    const spawnAudio = spawnAudioRef.current
    if (!spawnAudio || !spawnAudio.paused) return
    spawnAudio.currentTime = 0
    void spawnAudio.play().catch(() => {})
  }, [unlock])

  const stopSpawnLoop = useCallback(() => {
    const spawnAudio = spawnAudioRef.current
    if (!spawnAudio || spawnAudio.paused) return
    spawnAudio.pause()
    spawnAudio.currentTime = 0
  }, [])

  return { unlock, playRandom, playSound, startSpawnLoop, stopSpawnLoop }
}

function Burst({ burst, reduceMotion }: { burst: BurstState; reduceMotion: boolean }) {
  const droplets = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        angle: (i / 8) * Math.PI * 2 + randomBetween(-0.2, 0.2),
        distance: randomBetween(burst.radius * 0.5, burst.radius * 1.4),
      })),
    [burst.radius],
  )

  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: burst.x, top: burst.y, width: 0, height: 0 }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? motionDuration.micro : motionDuration.standard }}
    >
      <motion.div
        className="absolute rounded-full border-2 border-white/70"
        style={{
          width: burst.radius * 2,
          height: burst.radius * 2,
          marginLeft: -burst.radius,
          marginTop: -burst.radius,
          boxShadow: `0 0 24px hsla(${burst.hue}, 90%, 75%, 0.45)`,
        }}
        initial={{ scale: 0.35, opacity: 0.95 }}
        animate={{ scale: reduceMotion ? 1.1 : 1.65, opacity: 0 }}
        transition={{
          duration: reduceMotion ? motionDuration.micro : motionDuration.standard,
          ease: 'easeOut',
        }}
      />
      {!reduceMotion
        ? droplets.map((drop) => (
            <motion.span
              key={drop.id}
              className="absolute block rounded-full bg-white/80"
              style={{
                width: Math.max(4, burst.radius * 0.14),
                height: Math.max(4, burst.radius * 0.14),
                marginLeft: -2,
                marginTop: -2,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos(drop.angle) * drop.distance,
                y: Math.sin(drop.angle) * drop.distance,
                opacity: 0,
                scale: 0.2,
              }}
              transition={{ duration: motionDuration.standard, ease: 'easeOut' }}
            />
          ))
        : null}
    </motion.div>
  )
}

export function Soundboard({
  bubbleCount = 48,
  riseSpeed = 2,
  showHint = true,
  className,
}: SoundboardProps) {
  const reduceMotion = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const bgSampleRef = useRef<HTMLCanvasElement | null>(null)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const pointerRef = useRef<PointerCoords>({ x: -9999, y: -9999, active: false })
  const pointerOverRef = useRef(false)
  const pointerDownRef = useRef(false)
  const usesMouseRef = useRef(false)
  const bubblesRef = useRef<BubbleState[]>([])
  const dimensionsRef = useRef({ width: 0, height: 0 })
  const lastSpawnAtRef = useRef(0)
  const cursorElRef = useRef<HTMLImageElement>(null)
  const cursorHitRadiusRef = useRef(remToPx(CURSOR_SIZE_REM / 2))
  const [bursts, setBursts] = useState<BurstState[]>([])
  const [lastPlayed, setLastPlayed] = useState<string | null>(null)
  const [cursorIndex, setCursorIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)
  const [searchParams] = useSearchParams()
  const debug = searchParams.get('debug') === '1'
  const { unlock, playRandom, playSound, startSpawnLoop, stopSpawnLoop } = useAudioPool()
  const hintId = useId()

  const riseMultiplier = riseSpeed * (reduceMotion ? 0.55 : 1)
  const background = useMemo(() => pickBackgroundImage(), [])
  const backgroundImage = background.src
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  )
  const activeBubbleCount = isMobile ? Math.max(1, Math.round(bubbleCount / 2)) : bubbleCount

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useLayoutEffect(() => {
    lockSystemCursor()
    hideCursorOnElement(stageRef.current)
    hideCursorOnElement(canvasRef.current)
    return () => {
      unlockSystemCursor()
    }
  }, [])

  const syncCursorVisual = useCallback((x: number, y: number, visible: boolean) => {
    const cursor = cursorElRef.current
    if (!cursor) return
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
    cursor.style.opacity = visible ? '1' : '0'
  }, [])

  const syncPointerActive = useCallback(() => {
    pointerRef.current.active =
      startedRef.current &&
      pointerOverRef.current &&
      (usesMouseRef.current || pointerDownRef.current)
  }, [])

  useEffect(() => {
    startedRef.current = started
    if (!started) {
      pointerDownRef.current = false
      pointerRef.current.active = false
      stopSpawnLoop()
    }
  }, [started, stopSpawnLoop])

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      const stage = stageRef.current
      if (!stage) return

      if (event.pointerType === 'mouse') usesMouseRef.current = true

      const rect = stage.getBoundingClientRect()
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (!inside) {
        if (pointerOverRef.current) {
          pointerOverRef.current = false
          syncPointerActive()
          syncCursorVisual(pointerRef.current.x, pointerRef.current.y, false)
        }
        return
      }

      pointerOverRef.current = true

      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      pointerRef.current.x = x
      pointerRef.current.y = y
      syncPointerActive()
      reinforceSystemCursorHidden()
      syncCursorVisual(x, y, true)
    }

    window.addEventListener('pointermove', trackPointer, { passive: true })
    return () => window.removeEventListener('pointermove', trackPointer)
  }, [syncCursorVisual, syncPointerActive])

  const syncDimensions = useCallback(() => {
    const node = stageRef.current
    const canvas = canvasRef.current
    const bgCanvas = bgCanvasRef.current
    if (!node || !canvas) return
    const { width, height } = node.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    dimensionsRef.current = { width, height }
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    hideCursorOnElement(canvas)
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (bgCanvas) {
      bgCanvas.width = Math.floor(width * dpr)
      bgCanvas.height = Math.floor(height * dpr)
      bgCanvas.style.width = `${width}px`
      bgCanvas.style.height = `${height}px`
      const bgCtx = bgCanvas.getContext('2d')
      const image = bgImageRef.current
      if (bgCtx && image?.complete) {
        bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        bgCtx.clearRect(0, 0, width, height)
        drawBackgroundCover(bgCtx, image, width, height)
      }

      if (!bgSampleRef.current) {
        bgSampleRef.current = document.createElement('canvas')
      }
      const sampleCanvas = bgSampleRef.current
      sampleCanvas.width = Math.floor(width)
      sampleCanvas.height = Math.floor(height)
      const sampleCtx = sampleCanvas.getContext('2d')
      if (sampleCtx && image?.complete) {
        sampleCtx.clearRect(0, 0, width, height)
        drawBackgroundCover(sampleCtx, image, width, height)
      }
    }
  }, [])

  useEffect(() => {
    const image = new Image()
    image.src = backgroundImage
    image.decoding = 'async'
    const handleLoad = () => {
      bgImageRef.current = image
      syncDimensions()
    }
    if (image.complete) handleLoad()
    else image.addEventListener('load', handleLoad)
    return () => image.removeEventListener('load', handleLoad)
  }, [backgroundImage, syncDimensions])

  const seedBubbles = useCallback(() => {
    const { width, height } = dimensionsRef.current
    if (!width || !height) return
    bubblesRef.current = Array.from({ length: activeBubbleCount }, () =>
      createBubbleScattered(width, height, riseMultiplier),
    )
  }, [activeBubbleCount, riseMultiplier])

  const spawnBubblesAt = useCallback(
    (x: number, y: number, count = 1) => {
      const { width, height } = dimensionsRef.current
      if (!width || !height) return

      const spawned = Array.from({ length: count }, () =>
        createBubbleAt(x, y, width, height, riseMultiplier),
      )
      const maxBubbles = activeBubbleCount + 32
      bubblesRef.current = [...bubblesRef.current, ...spawned].slice(-maxBubbles)
    },
    [activeBubbleCount, riseMultiplier],
  )

  useEffect(() => {
    const syncHitRadius = () => {
      cursorHitRadiusRef.current = remToPx(CURSOR_SIZE_REM / 2)
    }
    syncHitRadius()
    window.addEventListener('resize', syncHitRadius)
    return () => window.removeEventListener('resize', syncHitRadius)
  }, [])

  useEffect(() => {
    syncDimensions()
    seedBubbles()
    const node = stageRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      syncDimensions()
      seedBubbles()
      cursorHitRadiusRef.current = remToPx(CURSOR_SIZE_REM / 2)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [seedBubbles, syncDimensions])

  const popBubble = useCallback(
    (bubble: BubbleState, x: number, y: number) => {
      setCursorIndex((prev) => (prev + 1) % CURSOR_FRAMES.length)
      const played = playRandom()
      if (played) setLastPlayed(played)
      const burstId = `burst-${bubble.id}-${Date.now()}`
      const popRadius = bubbleVisualRadius(bubble, performance.now())
      setBursts((prev) => [
        ...prev,
        { id: burstId, x, y, radius: popRadius, hue: bubble.hue },
      ])
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((burst) => burst.id !== burstId))
      }, motionDuration.standard * 1000 + 80)

      const { width, height } = dimensionsRef.current
      bubblesRef.current = bubblesRef.current.map((candidate) =>
        candidate.id === bubble.id ? createBubble(width, height, riseMultiplier) : candidate,
      )
    },
    [playRandom, riseMultiplier],
  )

  useEffect(() => {
    let frame = 0
    let lastTime = performance.now()

    const step = (time: number) => {
      const dt = Math.min(32, time - lastTime) / 1000
      lastTime = time

      const { width, height } = dimensionsRef.current
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const pointer = pointerRef.current
      const hitRadius = cursorHitRadiusRef.current

      if (ctx && width && height) {
        const nextBubbles: BubbleState[] = []

        ctx.clearRect(0, 0, width, height)

        for (const bubble of bubblesRef.current) {
          let next = { ...bubble, y: bubble.y - bubble.riseSpeed * dt }

          if (next.y < -next.radius * 1.5) {
            next = createBubble(width, height, riseMultiplier)
          }

          const { x: visualX, y: visualY } = bubbleVisualPosition(next, time)
          const visualRadius = bubbleVisualRadius(next, time)

          if (pointer.active && bubbleCanPop(next, time)) {
            const dx = pointer.x - visualX
            const dy = pointer.y - visualY
            const reach = hitRadius + visualRadius
            if (dx * dx + dy * dy <= reach * reach) {
              popBubble(next, visualX, visualY)
              next = createBubble(width, height, riseMultiplier)
            }
          }

          drawBubble(
            ctx,
            bgSampleRef.current,
            visualX,
            visualY,
            visualRadius,
            next.hue,
            false,
            !!reduceMotion,
          )
          nextBubbles.push(next)
        }

        bubblesRef.current = nextBubbles
      }

      frame = window.requestAnimationFrame(step)
    }

    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [popBubble, reduceMotion, riseMultiplier])

  const updatePointer = useCallback(
    (clientX: number, clientY: number) => {
      const node = stageRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()

      const x = clientX - rect.left
      const y = clientY - rect.top

      pointerRef.current.x = x
      pointerRef.current.y = y
      syncPointerActive()
      reinforceSystemCursorHidden()
      hideCursorOnElement(canvasRef.current)
      syncCursorVisual(x, y, pointerOverRef.current)
    },
    [syncCursorVisual, syncPointerActive],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!started) return
      unlock()
      if (event.pointerType === 'mouse') {
        usesMouseRef.current = true
      }
      pointerDownRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      updatePointer(event.clientX, event.clientY)

      const { x, y } = pointerRef.current
      spawnBubblesAt(x, y, Math.floor(randomBetween(4, 9.99)))
      lastSpawnAtRef.current = performance.now()
      startSpawnLoop()
    },
    [started, unlock, updatePointer, spawnBubblesAt, startSpawnLoop],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!startedRef.current) return
      if (event.pointerType === 'mouse') usesMouseRef.current = true
      updatePointer(event.clientX, event.clientY)

      if (!pointerDownRef.current) return

      const now = performance.now()
      if (now - lastSpawnAtRef.current < 140) return
      lastSpawnAtRef.current = now

      const { x, y } = pointerRef.current
      spawnBubblesAt(x, y, 1)
    },
    [updatePointer, spawnBubblesAt],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      pointerDownRef.current = false
      syncPointerActive()
      stopSpawnLoop()
    },
    [syncPointerActive, stopSpawnLoop],
  )

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      unlock()
      pointerOverRef.current = true
      if (event.pointerType === 'mouse') usesMouseRef.current = true
      const node = stageRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      pointerRef.current.x = x
      pointerRef.current.y = y
      syncPointerActive()
      syncCursorVisual(x, y, true)
    },
    [unlock, syncCursorVisual, syncPointerActive],
  )

  const handleStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      unlock()
      startedRef.current = true
      setStarted(true)

      pointerOverRef.current = true
      if (event.pointerType === 'mouse') usesMouseRef.current = true

      const stage = stageRef.current
      if (stage) {
        const rect = stage.getBoundingClientRect()
        const { width, height } = dimensionsRef.current
        pointerRef.current.x = event.clientX - rect.left
        pointerRef.current.y = event.clientY - rect.top
        if (width > 0 && height > 0) {
          pointerRef.current.x = Math.min(Math.max(pointerRef.current.x, 0), width)
          pointerRef.current.y = Math.min(Math.max(pointerRef.current.y, 0), height)
        }
        syncPointerActive()
        syncCursorVisual(pointerRef.current.x, pointerRef.current.y, true)
      }
    },
    [unlock, syncCursorVisual, syncPointerActive],
  )

  const handlePointerLeave = useCallback(() => {
    pointerOverRef.current = false
    pointerDownRef.current = false
    syncPointerActive()
    syncCursorVisual(pointerRef.current.x, pointerRef.current.y, false)
    stopSpawnLoop()
  }, [syncCursorVisual, syncPointerActive, stopSpawnLoop])

  return (
    <section
      ref={stageRef}
      className={cn(
        'relative min-h-[100svh] w-full cursor-none overflow-hidden bg-[#0a0e1a] touch-none select-none [&_*]:!cursor-none',
        !started && 'pointer-events-none',
        className,
      )}
      style={{ cursor: 'none' }}
      aria-label="Soundboard — touch bubbles to play sounds"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        ref={bgCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-none"
        style={{ cursor: 'none' }}
        aria-hidden
      />

      <img
        ref={cursorElRef}
        src={CURSOR_FRAMES[cursorIndex]}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute left-0 top-0 z-[100] size-28 select-none will-change-transform"
      />

      <AnimatePresence>
        {bursts.map((burst) => (
          <Burst key={burst.id} burst={burst} reduceMotion={!!reduceMotion} />
        ))}
      </AnimatePresence>

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
        {showHint && started ? (
          <p
            id={hintId}
            className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white/55 backdrop-blur-sm"
          >
            Touch the bubbles · press to spawn
          </p>
        ) : null}
        <a
          href="https://loehx.com"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[11px] font-medium text-white/50 backdrop-blur-sm transition-colors hover:border-white/25 hover:text-white/70"
          onPointerDown={(event) => event.stopPropagation()}
        >
          Alexander Löhn - visit me on loehx.com
        </a>
      </div>

      <AnimatePresence>
        {!started ? (
          <motion.div
            key="intro"
            className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-gradient-to-b from-black/50 to-black/100"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : motionDuration.standard }}
          >
            <motion.button
              type="button"
              aria-label="Start the experience"
              className="group cursor-none px-4 py-3 transition-transform active:scale-95"
              style={{ cursor: 'none' }}
              onPointerDown={handleStart}
            >
              <IntroLetterReveal reduceMotion={!!reduceMotion} />
            </motion.button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {debug ? (
        <>
          <div
            className="pointer-events-auto absolute inset-x-0 top-0 z-50 flex flex-wrap gap-2 border-b border-amber-300/20 bg-black/90 p-3 backdrop-blur-sm"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            {SOUNDBOARD_SOUND_ENTRIES.map((entry, index) => (
              <button
                key={entry.name}
                type="button"
                className={cn(
                  'min-h-11 min-w-11 rounded-lg border px-4 py-2.5 font-mono text-sm font-medium transition-colors active:scale-95',
                  lastPlayed === entry.label
                    ? 'border-amber-300/60 bg-amber-300/20 text-amber-100'
                    : 'border-white/15 bg-white/5 text-white/80 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100',
                )}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  unlock()
                  const played = playSound(index)
                  if (played) setLastPlayed(played)
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <p
            className="pointer-events-none absolute bottom-20 left-4 z-30 max-w-[min(70vw,20rem)] truncate rounded-lg border border-amber-300/30 bg-black/90 px-3 py-2 font-mono text-xs text-amber-100 shadow-lg backdrop-blur-sm"
            aria-live="polite"
          >
            {lastPlayed ?? '—'}
          </p>
          <p className="pointer-events-none absolute bottom-4 left-4 z-30 max-w-[min(70vw,20rem)] truncate rounded-lg border border-amber-300/30 bg-black/90 px-3 py-2 font-mono text-xs text-amber-100 shadow-lg backdrop-blur-sm">
            wallpaper: {background.name}
          </p>
        </>
      ) : null}
    </section>
  )
}
