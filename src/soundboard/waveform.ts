const SILENCE_WINDOW_MS = 12

export const DEFAULT_WAVEFORM_TOLERANCE = {
  startThreshold: 0.015,
  tailThreshold: 0.015,
} as const

export type WaveformTolerance = {
  startThreshold: number
  tailThreshold: number
}

let sharedAudioContext: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext()
  }
  return sharedAudioContext
}

export async function decodeAudioBuffer(src: string): Promise<AudioBuffer> {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Failed to load ${src}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return getSharedAudioContext().decodeAudioData(arrayBuffer)
}

export type WaveformPeak = {
  min: number
  max: number
}

export type WaveformAnalysis = {
  duration: number
  peaks: WaveformPeak[]
  contentStartRatio: number
  contentEndRatio: number
  headSilenceSeconds: number
  tailSilenceSeconds: number
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = buffer
  if (numberOfChannels === 1) {
    return buffer.getChannelData(0)
  }

  const mono = new Float32Array(length)
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      mono[index] += data[index] / numberOfChannels
    }
  }
  return mono
}

function findContentStartSample(
  samples: Float32Array,
  sampleRate: number,
  threshold: number,
): number {
  const windowSize = Math.max(1, Math.floor((SILENCE_WINDOW_MS / 1000) * sampleRate))

  for (let start = 0; start < samples.length; start += windowSize) {
    const end = Math.min(start + windowSize, samples.length)
    let peak = 0
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0))
    }
    if (peak > threshold) {
      return start
    }
  }

  return samples.length
}

function findContentEndSample(
  samples: Float32Array,
  sampleRate: number,
  threshold: number,
): number {
  const windowSize = Math.max(1, Math.floor((SILENCE_WINDOW_MS / 1000) * sampleRate))

  for (let end = samples.length; end > 0; end -= windowSize) {
    const start = Math.max(0, end - windowSize)
    let peak = 0
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0))
    }
    if (peak > threshold) {
      return Math.min(end, samples.length)
    }
  }

  return 0
}

export function analyzeWaveform(
  buffer: AudioBuffer,
  tolerance: WaveformTolerance = DEFAULT_WAVEFORM_TOLERANCE,
  peakCount = 512,
): WaveformAnalysis {
  const samples = mixToMono(buffer)
  const blockSize = Math.max(1, Math.floor(samples.length / peakCount))
  const peaks: WaveformPeak[] = []

  for (let block = 0; block < peakCount; block += 1) {
    const start = block * blockSize
    const end = Math.min(start + blockSize, samples.length)
    let min = 0
    let max = 0

    for (let index = start; index < end; index += 1) {
      const value = samples[index] ?? 0
      min = Math.min(min, value)
      max = Math.max(max, value)
    }

    peaks.push({ min, max })
  }

  const contentStartSample = findContentStartSample(
    samples,
    buffer.sampleRate,
    tolerance.startThreshold,
  )
  const contentEndSample = findContentEndSample(
    samples,
    buffer.sampleRate,
    tolerance.tailThreshold,
  )
  const contentStartRatio = samples.length > 0 ? contentStartSample / samples.length : 0
  const contentEndRatio = samples.length > 0 ? contentEndSample / samples.length : 1
  const headSilenceSeconds = Math.max(0, contentStartSample / buffer.sampleRate)
  const tailSilenceSeconds = Math.max(0, buffer.duration - contentEndSample / buffer.sampleRate)

  return {
    duration: buffer.duration,
    peaks,
    contentStartRatio,
    contentEndRatio,
    headSilenceSeconds,
    tailSilenceSeconds,
  }
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  analysis: WaveformAnalysis,
  options?: {
    activeProgress?: number
  },
) {
  const context = canvas.getContext('2d')
  if (!context) return

  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width <= 0 || height <= 0) return

  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)

  const midY = height / 2
  const amplitude = height * 0.42
  const { peaks, contentStartRatio, contentEndRatio } = analysis
  const barWidth = width / peaks.length
  const headEndX = contentStartRatio * width
  const tailStartX = contentEndRatio * width
  const activeProgress = options?.activeProgress ?? -1

  context.fillStyle = 'rgba(9, 9, 11, 0.9)'
  context.fillRect(0, 0, width, height)

  for (let index = 0; index < peaks.length; index += 1) {
    const peak = peaks[index]
    if (!peak) continue

    const x = index * barWidth
    const inHead = x < headEndX
    const inTail = x >= tailStartX
    const inPlayedRegion = activeProgress >= 0 && x <= activeProgress * width

    context.fillStyle = inHead
      ? 'rgba(96, 165, 250, 0.85)'
      : inTail
        ? 'rgba(248, 113, 113, 0.85)'
        : inPlayedRegion
          ? 'rgba(252, 211, 77, 0.95)'
          : 'rgba(250, 250, 250, 0.82)'

    const top = midY - peak.max * amplitude
    const bottom = midY - peak.min * amplitude
    context.fillRect(x, top, Math.max(1, barWidth), Math.max(1, bottom - top))
  }

  if (contentStartRatio > 0.005) {
    context.strokeStyle = 'rgba(96, 165, 250, 0.55)'
    context.setLineDash([4, 4])
    context.beginPath()
    context.moveTo(headEndX, 0)
    context.lineTo(headEndX, height)
    context.stroke()
    context.setLineDash([])
  }

  if (contentEndRatio < 0.995) {
    context.strokeStyle = 'rgba(248, 113, 113, 0.55)'
    context.setLineDash([4, 4])
    context.beginPath()
    context.moveTo(tailStartX, 0)
    context.lineTo(tailStartX, height)
    context.stroke()
    context.setLineDash([])
  }

  if (activeProgress >= 0) {
    context.strokeStyle = 'rgba(252, 211, 77, 0.9)'
    context.beginPath()
    context.moveTo(activeProgress * width, 0)
    context.lineTo(activeProgress * width, height)
    context.stroke()
  }
}
