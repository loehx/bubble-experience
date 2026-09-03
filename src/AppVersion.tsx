import { APP_VERSION } from '@/version'

export function AppVersion() {
  return (
    <>
      <p className="pointer-events-none fixed bottom-0 left-0 z-[80] p-2 font-mono text-[12px] leading-none text-white/25">
        {APP_VERSION}
      </p>
      <a
        href="https://loehx.com"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-0 right-0 z-[80] p-2 font-mono text-[12px] leading-none text-white/25 transition-colors hover:text-white/45"
      >
        visit loehx.com
      </a>
    </>
  )
}
