import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

const targetUrl = process.env.CAPTURE_URL
const outputDir = process.env.CAPTURE_DIR

if (!targetUrl || !outputDir) {
  console.error('CAPTURE_URL and CAPTURE_DIR are required')
  process.exit(1)
}

mkdirSync(outputDir, { recursive: true })

const runtime = join(process.env.HOME || '', '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')

const configFile = join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json')
const config = JSON.parse(readFileSync(configFile, 'utf8'))
if (process.platform === 'linux' && !process.env.DISPLAY) {
  process.env.DISPLAY = ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()
}

function transient(error) {
  error.exitCode = 75
  return error
}

async function timed(label, fn) {
  const started = performance.now()
  const result = await fn()
  console.log(`[capture] ${label}: ${(performance.now() - started).toFixed(0)}ms`)
  return result
}

let browser
const defects = []
const viewports = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844]
]

try {
  browser = await timed('launch browser', () =>
    chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch((error) => {
      throw transient(error)
    })
  )

  for (const [name, width, height] of viewports) {
    const page = await timed(`new page ${name}`, () =>
      browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 }).catch((error) => {
        throw transient(error)
      })
    )
    page.setDefaultTimeout(30000)

    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
      console.error(`[pageerror ${name}] ${error.message}`)
    })
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[console ${name}] ${message.text()}`)
    })

    let response
    try {
      response = await timed(`navigate ${name}`, () =>
        page.goto(targetUrl, { waitUntil: 'load', timeout: 45000 })
      )
    } catch (error) {
      throw transient(error)
    }

    if (!response) throw transient(new Error('No HTTP response from the preview'))
    if (!response.ok()) {
      const status = response.status()
      const error = new Error(`HTTP ${status} loading ${targetUrl}`)
      if (status >= 500 || status === 408 || status === 429) throw transient(error)
      throw error
    }

    await timed(`wait for first render ${name}`, () =>
      page
        .waitForFunction(() => window.__gameReady === true && (window.__frameCount || 0) > 1, null, {
          timeout: 45000
        })
        .catch((error) => {
          throw new Error(`Game did not render in time: ${error.message}`)
        })
    )

    const play = page.locator('#play-btn')
    if (await play.isVisible().catch(() => false)) {
      await timed(`start match ${name}`, () =>
        play.click({ timeout: 10000, noWaitAfter: true }).catch((error) => {
          throw new Error(`Could not start the match: ${error.message}`)
        })
      )
    }

    await page.waitForTimeout(1200)
    // Headed Chromium under Xvfb paints the OS pointer into screenshots.
    // Park it in a corner so gameplay captures stay clean.
    await page.mouse.move(1, 1)
    await page.waitForTimeout(150)

    const stats = await page.evaluate(() => ({
      frames: window.__frameCount || 0,
      canvases: document.querySelectorAll('canvas').length,
      state: window.__game?.state || 'unknown',
      score: window.__game ? `${window.__game.score.blue}:${window.__game.score.red}` : 'unknown'
    }))

    console.log(`[capture] ${name} stats: ${JSON.stringify(stats)}`)

    if (stats.canvases < 1) defects.push(`${name}: no canvas element`)
    if (stats.frames < 10) defects.push(`${name}: only ${stats.frames} frames rendered`)
    if (!['playing', 'goal', 'ended'].includes(stats.state)) {
      defects.push(`${name}: match did not start (state ${stats.state})`)
    }

    const screenshotPath = join(outputDir, `final-${name}.png`)
    await timed(`screenshot ${name}`, () =>
      page.screenshot({ path: screenshotPath, timeout: 30000 }).catch((error) => {
        if (error.name === 'TimeoutError' || !browser.isConnected()) throw transient(error)
        throw error
      })
    )

    const bytes = statSync(screenshotPath).size
    console.log(`[capture] ${name} screenshot: ${screenshotPath} (${bytes} bytes)`)
    if (bytes < 20000) defects.push(`${name}: screenshot is suspiciously small (${bytes} bytes)`)

    if (pageErrors.length) {
      defects.push(`${name}: page errors: ${pageErrors.slice(0, 3).join(' | ')}`)
    }

    await page.close()
  }
} catch (error) {
  console.error(`[capture] failed: ${error.message}`)
  process.exitCode = error.exitCode || 1
} finally {
  await browser?.close().catch((error) => {
    console.error(`[capture] browser close failed: ${error.message}`)
    process.exitCode ||= 75
  })
}

if (!process.exitCode && defects.length) {
  console.error('[capture] rendering defects:\n - ' + defects.join('\n - '))
  process.exitCode = 1
}

if (process.exitCode) {
  console.error(`[capture] exiting with ${process.exitCode}`)
}
