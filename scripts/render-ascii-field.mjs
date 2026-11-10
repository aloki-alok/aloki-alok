// Renders the "alok" ASCII field from alokranjan.me as a looping SVG for the README.
// GitHub strips scripts, so every frame is baked in and CSS steps through them.
// Run from a folder with playwright installed:
//   node render-ascii-field.mjs <JetBrainsMono.woff2> <ramp-subset.woff2> <out.svg>
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const [fontPath, subsetPath, out] = process.argv.slice(2)
const COLS = 96, ROWS = 14, FPS = 10
// 16 s holds a whole number of both haze waves, so the last frame meets the first.
const LOOP = 16
const W1 = (2 * Math.PI * 2) / LOOP, W2 = (2 * Math.PI * 1) / LOOP
// Ripples stand in for the clicks a visitor makes on the site. Each one ends before the loop does.
const DROPS = [{ x: 18, y: 7, t: 1.5 }, { x: 62, y: 4, t: 6.5 }, { x: 40, y: 10, t: 11 }]

const browser = await chromium.launch()
const page = await browser.newPage()
const font = readFileSync(fontPath).toString('base64')
await page.setContent(`<style>@font-face{font-family:J;src:url(data:font/woff2;base64,${font})}</style><span style="font-family:J">a</span>`)
await page.evaluate(() => document.fonts.ready)

const frames = await page.evaluate(({ COLS, ROWS, FPS, LOOP, W1, W2, DROPS }) => {
  // Same mask and shading as field() in the site's src/lib/ascii-field.js.
  const RAMP = ' .·:-=+*#%@'
  const mask = document.createElement('canvas').getContext('2d')
  mask.canvas.width = COLS
  mask.canvas.height = ROWS
  mask.fillStyle = '#000'
  mask.fillRect(0, 0, COLS, ROWS)
  mask.fillStyle = '#fff'
  mask.textBaseline = 'middle'
  mask.font = `400 ${ROWS * 2.3}px J`
  mask.save()
  mask.scale(1, 0.5)
  const wide = mask.measureText('alok').width
  mask.fillText('alok', Math.max(1, (COLS - wide) * 0.06), ROWS)
  mask.restore()
  const data = mask.getImageData(0, 0, COLS, ROWS).data
  const frames = []
  for (let f = 0; f < LOOP * FPS; f++) {
    const T = f / FPS
    const rows = []
    for (let y = 0; y < ROWS; y++) {
      let row = ''
      for (let x = 0; x < COLS; x++) {
        let v = (data[(y * COLS + x) * 4] / 255) * 0.92
        const haze = (Math.sin(x * 0.11 + T * W1) + Math.sin(y * 0.45 - T * W2 + x * 0.05)) * 0.5
        v += haze > 0.55 ? (haze - 0.55) * 0.35 : 0
        for (const d of DROPS) {
          const age = T - d.t
          if (age < 0 || age > 2.4) continue
          const dist = Math.hypot((x - d.x) * 0.5, y - d.y)
          v += Math.cos((dist - age * 14) * 0.9) * Math.max(0, 1 - Math.abs(dist - age * 14) / 3) * (1 - age / 2.4) * 0.5
        }
        row += RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))))]
      }
      rows.push(row)
    }
    frames.push(rows)
  }
  return frames
}, { COLS, ROWS, FPS, LOOP, W1, W2, DROPS })
await browser.close()

// One cell is 6 by 10 units: JetBrains Mono advances 0.6 em at a 10-unit font size.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const n = frames.length
const body = frames.map((rows, i) =>
  `<g style="animation-delay:${(i / FPS).toFixed(1)}s">${rows.map((r, y) => `<text y="${y * 10 + 8}">${esc(r)}</text>`).join('')}</g>`
).join('\n')
const subset = readFileSync(subsetPath).toString('base64')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS * 6} ${ROWS * 10}" role="img" aria-label="alok">
<style>
@font-face{font-family:J;src:url(data:font/woff2;base64,${subset})}
text{font:400 10px J,ui-monospace,monospace;white-space:pre;fill:#8b8b8b}
g{visibility:hidden;animation:s ${LOOP}s steps(1) infinite}
@keyframes s{0%{visibility:visible}${(100 / n).toFixed(4)}%{visibility:hidden}}
@media (prefers-reduced-motion:reduce){g{animation:none}g:first-of-type{visibility:visible}}
</style>
${body}
</svg>
`
writeFileSync(out, svg)
console.log(`${n} frames, ${(svg.length / 1024).toFixed(0)} KB`)
