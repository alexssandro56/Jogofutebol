import './style.css'
import { createWorld } from './world.js'
import { FootballGame } from './game.js'

class AudioKit {
  constructor() {
    this.ctx = null
    this.enabled = true
  }

  resume() {
    if (!this.enabled) return null
    try {
      if (!this.ctx) {
        const Context = window.AudioContext || window.webkitAudioContext
        if (!Context) return null
        this.ctx = new Context()
      }
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return this.ctx
    } catch {
      return null
    }
  }

  tone(frequency, duration, { type = 'sine', volume = 0.08, slideTo = null, delay = 0 } = {}) {
    if (!this.enabled) return
    const ctx = this.resume()
    if (!ctx) return
    const start = ctx.currentTime + delay
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, slideTo), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  play(kind) {
    if (!this.enabled) return
    if (kind === 'kick') {
      this.tone(190, 0.1, { type: 'triangle', volume: 0.16, slideTo: 70 })
      this.tone(420, 0.05, { type: 'square', volume: 0.045, slideTo: 200 })
    } else if (kind === 'pass') {
      this.tone(300, 0.08, { type: 'triangle', volume: 0.08, slideTo: 180 })
    } else if (kind === 'goal') {
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((frequency, index) => {
        this.tone(frequency, 0.5, { type: 'triangle', volume: 0.1, delay: index * 0.09 })
        this.tone(frequency / 2, 0.55, { type: 'sine', volume: 0.05, delay: index * 0.09 })
      })
    } else if (kind === 'whistle') {
      this.tone(1850, 0.16, { type: 'sine', volume: 0.09, slideTo: 2100 })
      this.tone(2200, 0.2, { type: 'sine', volume: 0.06, delay: 0.17, slideTo: 2050 })
    }
  }
}

const container = document.getElementById('scene')
const loading = document.getElementById('loading')
const menu = document.getElementById('menu')
const endScreen = document.getElementById('end-screen')
const hud = document.getElementById('hud')
const hint = document.getElementById('hint')
const mobileControls = document.getElementById('mobile-controls')
const scoreEl = document.getElementById('score')
const clockEl = document.getElementById('clock')
const goalBanner = document.getElementById('goal-banner')
const goalText = document.getElementById('goal-text')
const playBtn = document.getElementById('play-btn')
const restartBtn = document.getElementById('restart-btn')
const soundBtn = document.getElementById('sound-btn')
const endTitle = document.getElementById('end-title')
const endScore = document.getElementById('end-score')
const difficultyButtons = [...document.querySelectorAll('[data-difficulty]')]

const audio = new AudioKit()
let selectedDifficulty = 'normal'

let world
let game

try {
  world = createWorld(container)
  game = new FootballGame({
    scene: world.scene,
    camera: world.camera,
    events: {
      onScore(blue, red) {
        scoreEl.textContent = `${blue} : ${red}`
      },
      onClock(text) {
        clockEl.textContent = text
      },
      onGoal(team) {
        goalText.textContent = team === 'blue' ? 'GOL DO AZUL!' : 'GOL DO VERMELHO!'
        goalBanner.classList.remove('hidden')
        goalText.style.animation = 'none'
        void goalText.offsetWidth
        goalText.style.animation = ''
      },
      onState(state) {
        if (state === 'playing') goalBanner.classList.add('hidden')
        if (state === 'ended') goalBanner.classList.add('hidden')
      },
      onEnd(blue, red) {
        const title = blue > red ? 'VITÓRIA DO AZUL' : blue < red ? 'VITÓRIA DO VERMELHO' : 'EMPATE'
        endTitle.textContent = title
        endScore.textContent = `${blue} : ${red}`
        goalBanner.classList.add('hidden')
        endScreen.classList.remove('hidden')
        document.body.classList.add('match-over')
      },
      onKick(kind) {
        audio.play(kind)
      }
    }
  })
  window.__game = game
} catch (error) {
  console.error(error)
  loading.textContent = 'Não foi possível iniciar o WebGL neste navegador.'
  loading.style.color = '#ff8a96'
  throw error
}

window.__gameReady = false
window.__frameCount = 0

function beginMatch() {
  audio.resume()
  menu.classList.add('hidden')
  endScreen.classList.add('hidden')
  hud.classList.remove('hidden')
  hint.classList.remove('hidden')
  mobileControls.classList.remove('hidden')
  document.body.classList.add('in-game')
  document.body.classList.remove('match-over')
  goalBanner.classList.add('hidden')
  game.startMatch(selectedDifficulty)
}

playBtn.addEventListener('click', beginMatch)
restartBtn.addEventListener('click', beginMatch)

for (const button of difficultyButtons) {
  button.addEventListener('click', () => {
    selectedDifficulty = button.dataset.difficulty || 'normal'
    for (const other of difficultyButtons) {
      other.classList.toggle('active', other === button)
      other.setAttribute('aria-pressed', String(other === button))
    }
  })
}

soundBtn.addEventListener('click', () => {
  audio.enabled = !audio.enabled
  if (audio.enabled) audio.resume()
  soundBtn.textContent = audio.enabled ? 'SOM ON' : 'SOM OFF'
  soundBtn.setAttribute('aria-pressed', String(audio.enabled))
})

const keys = new Set()

function applyKeys() {
  const x =
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
    (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
  const z =
    (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
  game.setInput(x, z, keys.has('ShiftLeft') || keys.has('ShiftRight'))
}

window.addEventListener('keydown', (event) => {
  const code = event.code
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
    event.preventDefault()
  }

  const inMatch = document.body.classList.contains('in-game') && !document.body.classList.contains('match-over')

  if ((code === 'Enter' || code === 'Space') && !inMatch) {
    if (!event.repeat) beginMatch()
    return
  }

  if (!inMatch) return

  if (code === 'Space' && !event.repeat) {
    audio.resume()
    game.userKick()
  } else if (code === 'KeyE' && !event.repeat) {
    audio.resume()
    game.userPass()
  } else if (code === 'KeyQ' && !event.repeat) {
    game.switchPlayer()
  }

  keys.add(code)
  applyKeys()
})

window.addEventListener('keyup', (event) => {
  keys.delete(event.code)
  applyKeys()
})

window.addEventListener('blur', () => {
  keys.clear()
  game.setInput(0, 0, false)
  resetStick()
})

const stick = document.getElementById('joystick')
const knob = document.getElementById('stick-knob')
const kickBtn = document.getElementById('kick-btn')
const passBtn = document.getElementById('pass-btn')
let stickPointer = null

function setStick(event) {
  const rect = stick.getBoundingClientRect()
  const maxRadius = rect.width * 0.32
  let dx = event.clientX - (rect.left + rect.width / 2)
  let dy = event.clientY - (rect.top + rect.height / 2)
  const distance = Math.hypot(dx, dy)

  if (distance > maxRadius) {
    dx = (dx / distance) * maxRadius
    dy = (dy / distance) * maxRadius
  }

  knob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`
  const nx = dx / maxRadius
  const ny = dy / maxRadius
  game.setInput(nx, -ny, Math.hypot(nx, ny) > 0.86)
}

function resetStick() {
  stickPointer = null
  knob.style.transform = 'translate(-50%, -50%)'
  if (game) game.setInput(0, 0, false)
}

stick.addEventListener('pointerdown', (event) => {
  stickPointer = event.pointerId
  stick.setPointerCapture?.(event.pointerId)
  stick.classList.add('active')
  audio.resume()
  setStick(event)
  event.preventDefault()
})

stick.addEventListener('pointermove', (event) => {
  if (event.pointerId !== stickPointer) return
  setStick(event)
  event.preventDefault()
})

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  stick.addEventListener(type, (event) => {
    if (event.pointerId !== stickPointer) return
    stick.classList.remove('active')
    resetStick()
  })
}

for (const [button, action] of [
  [kickBtn, () => game.userKick()],
  [passBtn, () => game.userPass()]
]) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    audio.resume()
    button.classList.add('pressed')
    action()
  })
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    button.addEventListener(type, () => button.classList.remove('pressed'))
  }
}

let last = performance.now()

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25)
  last = now

  game.update(dt)
  world.renderer.render(world.scene, world.camera)
  window.__frameCount += 1

  if (!window.__gameReady) {
    window.__gameReady = true
    loading.classList.add('hidden')
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
