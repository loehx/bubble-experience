import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'public', 'og-image.jpg')
const url = process.env.OG_CAPTURE_URL ?? 'http://localhost:5176/'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1200, height: 627 },
  deviceScaleFactor: 1,
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Start the experience' }).first().waitFor({ state: 'visible' })
// Intro face finishes at ~2.5s (1.5s delay + 1s animation).
await page.waitForTimeout(3000)

await page.screenshot({
  path: output,
  type: 'jpeg',
  quality: 92,
  fullPage: false,
})

await browser.close()
console.log(`Saved ${output}`)
