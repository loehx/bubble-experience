import { APP_VERSION } from '@/version'

export function AppVersion() {
  return (
    <p className="pointer-events-none fixed bottom-2 left-2 z-[80] font-mono text-[11px] leading-none text-white/25">
      {APP_VERSION}
    </p>
  )
}
