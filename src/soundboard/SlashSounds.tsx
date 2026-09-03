import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { SOUNDBOARD_SOUND_ENTRIES } from './sounds'
import {
  analyzeWaveform,
  decodeAudioBuffer,
  DEFAULT_WAVEFORM_TOLERANCE,
  drawWaveform,
  getSharedAudioContext,
  type WaveformAnalysis,
  type WaveformTolerance,
} from './waveform'

const TRIM_FLAG_SECONDS = 0.12

type SoundCardState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; buffer: AudioBuffer }

function formatSeconds(seconds: number) {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
  return `${seconds.toFixed(2)}s`
}

function formatThreshold(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function ToleranceControl({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-white/85">{label}</span>
        <span className="font-mono text-xs text-white/50">{formatThreshold(value)}</span>
      </div>
      <input
        type="range"
        min={0.2}
        max={8}
        step={0.1}
        value={value * 100}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="w-full accent-amber-300"
      />
      <span className="text-xs text-white/40">{description}</span>
    </label>
  )
}

function SoundWaveformCard({
  name,
  label,
  src,
  tolerance,
}: {
  name: string
  label: string
  src: string
  tolerance: WaveformTolerance
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const [state, setState] = useState<SoundCardState>({ status: 'loading' })
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(-1)

  const analysis = useMemo(() => {
    if (state.status !== 'ready') return null
    return analyzeWaveform(state.buffer, tolerance)
  }, [state, tolerance])

  useEffect(() => {
    let cancelled = false

    void decodeAudioBuffer(src)
      .then((buffer) => {
        if (cancelled) return
        setState({ status: 'ready', buffer })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Failed to decode audio'
        setState({ status: 'error', message })
      })

    return () => {
      cancelled = true
    }
  }, [src])

  const redraw = useCallback(
    (nextAnalysis: WaveformAnalysis, activeProgress = progress) => {
      const canvas = canvasRef.current
      if (!canvas) return
      drawWaveform(canvas, nextAnalysis, { activeProgress })
    },
    [progress],
  )

  useEffect(() => {
    if (!analysis) return

    const canvas = canvasRef.current
    if (!canvas) return

    redraw(analysis)

    const observer = new ResizeObserver(() => redraw(analysis))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [analysis, redraw])

  useEffect(() => {
    if (!analysis) return
    redraw(analysis, progress)
  }, [progress, redraw, analysis])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
      audioRef.current?.pause()
    }
  }, [])

  const stopPlayback = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    audioRef.current?.pause()
    setIsPlaying(false)
    setProgress(-1)
  }, [])

  const togglePlayback = useCallback(() => {
    if (state.status !== 'ready') return

    if (isPlaying) {
      stopPlayback()
      return
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(src)
      audioRef.current.addEventListener('ended', () => {
        stopPlayback()
      })
    }

    const audio = audioRef.current
    audio.currentTime = 0
    void getSharedAudioContext().resume()
    void audio.play().catch(() => {
      stopPlayback()
    })
    setIsPlaying(true)

    const tick = () => {
      if (!audio.duration || Number.isNaN(audio.duration)) {
        frameRef.current = requestAnimationFrame(tick)
        return
      }
      setProgress(audio.currentTime / audio.duration)
      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
  }, [isPlaying, src, state, stopPlayback])

  const headSilence = analysis?.headSilenceSeconds ?? null
  const tailSilence = analysis?.tailSilenceSeconds ?? null
  const needsHeadTrim = headSilence !== null && headSilence >= TRIM_FLAG_SECONDS
  const needsTailTrim = tailSilence !== null && tailSilence >= TRIM_FLAG_SECONDS
  const needsTrim = needsHeadTrim || needsTailTrim

  return (
    <article
      className={cn(
        'rounded-2xl border bg-white/[0.03] p-4 backdrop-blur-sm',
        needsTrim ? 'border-red-400/35' : 'border-white/10',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{name}</h2>
          <p className="text-xs text-white/45">Sound {label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {analysis ? (
            <>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/60">
                {formatSeconds(analysis.duration)}
              </span>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px]',
                  needsHeadTrim
                    ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
                    : 'border-white/10 text-white/50',
                )}
              >
                start {formatSeconds(headSilence ?? 0)}
              </span>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px]',
                  needsTailTrim
                    ? 'border-red-400/40 bg-red-400/10 text-red-200'
                    : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
                )}
              >
                tail {formatSeconds(tailSilence ?? 0)}
              </span>
            </>
          ) : null}

          <button
            type="button"
            disabled={state.status !== 'ready'}
            onClick={togglePlayback}
            className="rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? 'Stop' : 'Play'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/50">
        {state.status === 'loading' ? (
          <div className="flex h-24 items-center justify-center text-xs text-white/40">
            Decoding waveform…
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-red-300">
            {state.message}
          </div>
        ) : null}

        <canvas
          ref={canvasRef}
          className={cn('h-24 w-full', analysis ? 'block' : 'hidden')}
          aria-label={`Waveform for ${name}`}
        />
      </div>

      {analysis && needsTrim ? (
        <p className="mt-2 text-xs text-white/55">
          {needsHeadTrim ? (
            <span className="text-sky-200/80">Blue start</span>
          ) : null}
          {needsHeadTrim && needsTailTrim ? ' · ' : null}
          {needsTailTrim ? (
            <span className="text-red-200/80">red tail</span>
          ) : null}{' '}
          {needsHeadTrim && needsTailTrim
            ? 'are likely trimmable.'
            : needsHeadTrim
              ? 'is likely trimmable.'
              : 'is likely trimmable.'}
        </p>
      ) : null}
    </article>
  )
}

export function SlashSounds() {
  const sortedEntries = useMemo(() => [...SOUNDBOARD_SOUND_ENTRIES], [])
  const [tolerance, setTolerance] = useState<WaveformTolerance>({
    startThreshold: DEFAULT_WAVEFORM_TOLERANCE.startThreshold,
    tailThreshold: DEFAULT_WAVEFORM_TOLERANCE.tailThreshold,
  })

  return (
    <div className="min-h-[100svh] bg-[#09090b] text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/40">
              Soundboard tools
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Slash Sounds</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              Waveforms for every slash sound. Adjust tolerance to control what counts as silence at
              the start and tail.
            </p>
          </div>

          <Link
            to="/"
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/75 transition-colors hover:border-white/25 hover:text-white"
          >
            Back to experience
          </Link>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-white">Silence tolerance</h2>
          <p className="mt-1 text-xs text-white/45">
            Lower values are stricter and mark more as silence. Higher values are looser and only
            mark quieter sections.
          </p>
          <div className="mt-4 flex flex-wrap gap-6">
            <ToleranceControl
              label="Start"
              description="Leading silence to trim from the beginning."
              value={tolerance.startThreshold}
              onChange={(startThreshold) =>
                setTolerance((current) => ({ ...current, startThreshold }))
              }
            />
            <ToleranceControl
              label="Tail"
              description="Trailing silence to trim from the end."
              value={tolerance.tailThreshold}
              onChange={(tailThreshold) =>
                setTolerance((current) => ({ ...current, tailThreshold }))
              }
            />
          </div>
          <button
            type="button"
            onClick={() => setTolerance({ ...DEFAULT_WAVEFORM_TOLERANCE })}
            className="mt-4 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55 transition-colors hover:border-white/20 hover:text-white/75"
          >
            Reset to default
          </button>
        </section>

        <div className="flex flex-wrap gap-2 text-[11px] text-white/45">
          <span className="rounded-full border border-white/10 px-2.5 py-1">White = audio</span>
          <span className="rounded-full border border-sky-400/30 px-2.5 py-1 text-sky-200/80">
            Blue = likely trimmable start
          </span>
          <span className="rounded-full border border-red-400/30 px-2.5 py-1 text-red-200/80">
            Red = likely trimmable tail
          </span>
          <span className="rounded-full border border-amber-300/30 px-2.5 py-1 text-amber-100/80">
            Amber = playback position
          </span>
        </div>

        <div className="grid gap-4">
          {sortedEntries.map((entry) => (
            <SoundWaveformCard
              key={entry.name}
              name={entry.name}
              label={entry.label}
              src={entry.src}
              tolerance={tolerance}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
