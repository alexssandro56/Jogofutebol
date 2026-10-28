import * as THREE from 'three'
import { FIELD, createBallMesh, createPlayerMesh } from './world.js'

const MATCH_SECONDS = 120
const BALL_RADIUS = FIELD.ballRadius

const DIFFICULTIES = {
  easy: { ai: 0.9, shoot: 0.4, error: 2.5, press: 0.55 },
  normal: { ai: 1, shoot: 0.62, error: 1.35, press: 1 },
  hard: { ai: 1.08, shoot: 0.82, error: 0.6, press: 1.35 }
}

const FORMATIONS = {
  blue: [
    { role: 'GK', x: 0, z: -30.6, number: 1 },
    { role: 'DEF', x: -7.5, z: -19, number: 2 },
    { role: 'DEF', x: 7.5, z: -19, number: 5 },
    { role: 'MID', x: -6.2, z: -8, number: 8 },
    { role: 'MID', x: 6.2, z: -8, number: 10 },
    { role: 'FWD', x: 0, z: 3, number: 9 }
  ],
  red: [
    { role: 'GK', x: 0, z: 30.6, number: 1 },
    { role: 'DEF', x: -7.5, z: 19, number: 3 },
    { role: 'DEF', x: 7.5, z: 19, number: 4 },
    { role: 'MID', x: -6.2, z: 8, number: 6 },
    { role: 'MID', x: 6.2, z: 8, number: 7 },
    { role: 'FWD', x: 0, z: -3, number: 11 }
  ]
}

const ROLE_SPEED = { GK: 6.9, DEF: 7.1, MID: 7.45, FWD: 7.75 }

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function lerpAngle(current, target, amount) {
  let delta = (target - current + Math.PI) % (Math.PI * 2) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * amount
}

export class FootballGame {
  constructor({ scene, camera, events = {} }) {
    this.scene = scene
    this.camera = camera
    this.events = events
    this.players = []
    this.state = 'menu'
    this.time = 0
    this.timeRemaining = MATCH_SECONDS
    this.lastClock = ''
    this.score = { blue: 0, red: 0 }
    this.difficultyKey = 'normal'
    this.difficulty = DIFFICULTIES.normal
    this.input = { x: 0, z: 0, sprint: false }
    this.controlled = null
    this.selectionTimer = 0
    this.goalTimer = 0
    this.scoringTeam = null
    this.concedingTeam = null
    this.shake = 0
    this.lookTarget = new THREE.Vector3(0, 0, 0)
    this._scratch = new THREE.Vector3()
    this._scratch2 = new THREE.Vector3()

    this.buildPlayers()

    this.ball = {
      pos: new THREE.Vector3(0, BALL_RADIUS, 0),
      vel: new THREE.Vector3(),
      mesh: createBallMesh()
    }
    this.ball.mesh.position.copy(this.ball.pos)
    this.scene.add(this.ball.mesh)

    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 22),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    )
    this.ballShadow.rotation.x = -Math.PI / 2
    this.ballShadow.position.y = 0.05
    this.scene.add(this.ballShadow)

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.84, 40),
      new THREE.MeshBasicMaterial({
        color: 0x7ef9ff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.visible = false
    this.scene.add(this.ring)

    this.chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.34, 4),
      new THREE.MeshBasicMaterial({ color: 0x9dfcff, transparent: true, opacity: 0.9, depthWrite: false })
    )
    this.chevron.rotation.x = Math.PI
    this.chevron.visible = false
    this.scene.add(this.chevron)

    this.resetPositions('blue')
    this.controlled = this.pickNearestBlue()
    this.syncMeshes()
  }

  buildPlayers() {
    const teams = ['blue', 'red']
    let index = 0
    for (const team of teams) {
      for (const slot of FORMATIONS[team]) {
        const mesh = createPlayerMesh(team, slot.role, slot.number, index)
        const player = {
          team,
          role: slot.role,
          number: slot.number,
          index,
          home: new THREE.Vector3(slot.x, 0, slot.z),
          pos: new THREE.Vector3(slot.x, 0, slot.z),
          vel: new THREE.Vector3(),
          baseSpeed: ROLE_SPEED[slot.role],
          facing: team === 'blue' ? 0 : Math.PI,
          walkPhase: Math.random() * Math.PI * 2,
          swing: 0,
          bob: 0,
          kickCd: 0.6 + Math.random() * 0.8,
          mesh: mesh.group,
          shadow: mesh.shadow,
          parts: mesh.parts
        }
        this.scene.add(player.mesh)
        this.scene.add(player.shadow)
        this.players.push(player)
        index += 1
      }
    }
  }

  startMatch(difficultyKey = 'normal') {
    this.difficultyKey = DIFFICULTIES[difficultyKey] ? difficultyKey : 'normal'
    this.difficulty = DIFFICULTIES[this.difficultyKey]
    this.score.blue = 0
    this.score.red = 0
    this.timeRemaining = MATCH_SECONDS
    this.lastClock = ''
    this.goalTimer = 0
    this.scoringTeam = null
    this.concedingTeam = null
    this.shake = 0
    this.state = 'playing'
    this.resetPositions('blue')
    this.controlled = this.pickNearestBlue()
    this.events.onScore?.(0, 0)
    this.events.onClock?.(formatClock(MATCH_SECONDS))
    this.events.onKick?.('whistle')
    this.events.onState?.('playing')
  }

  resetPositions(kickoffTeam = 'blue') {
    for (const player of this.players) {
      const attack = player.team === 'blue' ? 1 : -1
      player.pos.copy(player.home)
      player.vel.set(0, 0, 0)
      player.facing = player.team === 'blue' ? 0 : Math.PI
      player.kickCd = 0.5 + Math.random() * 0.7
      player.swing = 0
      player.bob = 0
      if (player.role === 'FWD') {
        player.pos.z = player.team === kickoffTeam ? -attack * 1.2 : -attack * 3.4
      }
      clampPlayer(player)
    }

    this.ball.pos.set(0, BALL_RADIUS, 0)
    this.ball.vel.set(0, 0, 0)
    this.ball.mesh.position.copy(this.ball.pos)
    this.ball.mesh.quaternion.identity()
    this.ballShadow.position.set(0, 0.05, 0)
  }

  setInput(x, z, sprint = false) {
    const length = Math.hypot(x, z)
    if (length > 1) {
      x /= length
      z /= length
    }
    this.input.x = x
    this.input.z = z
    this.input.sprint = Boolean(sprint)
  }

  userKick() {
    if (this.state !== 'playing' || !this.controlled) return false
    const player = this.controlled
    if (horizontalDistance(player.pos, this.ball.pos) > 2.05) return false
    if (this.ball.pos.y > 1.9) return false

    const goal = this.goalFor(player.team)
    const aimX = clamp(this.ball.pos.x * 0.1 + this.input.x * 1.7, -2.9, 2.9)
    const direction = this._scratch.set(aimX - this.ball.pos.x, 0, goal.z - this.ball.pos.z).normalize()
    const power = this.input.sprint ? 30 : 26

    this.ball.vel.set(direction.x * power, 3.6, direction.z * power)
    this.ball.pos.y = Math.max(this.ball.pos.y, BALL_RADIUS + 0.02)
    player.kickCd = 0.55
    this.shake = Math.max(this.shake, 0.22)
    this.events.onKick?.('kick')
    return true
  }

  userPass() {
    if (this.state !== 'playing' || !this.controlled) return false
    const player = this.controlled
    if (horizontalDistance(player.pos, this.ball.pos) > 2.05) return false
    if (this.ball.pos.y > 1.9) return false

    const target = this.bestPassTarget(player)
    if (!target) return this.userKick()

    const aim = this._scratch.set(
      target.pos.x + target.vel.x * 0.24 - this.ball.pos.x,
      0,
      target.pos.z + target.vel.z * 0.24 - this.ball.pos.z
    )
    if (aim.lengthSq() < 0.001) return false
    aim.normalize()
    const distance = horizontalDistance(player.pos, target.pos)
    const power = clamp(distance * 1.15 + 5, 10, 25)

    this.ball.vel.set(aim.x * power, 2.2, aim.z * power)
    player.kickCd = 0.45
    this.events.onKick?.('pass')
    return true
  }

  switchPlayer() {
    if (this.state !== 'playing') return
    const candidates = this.players
      .filter((player) => player.team === 'blue' && player.role !== 'GK' && player !== this.controlled)
      .sort((a, b) => horizontalDistance(a.pos, this.ball.pos) - horizontalDistance(b.pos, this.ball.pos))
    if (candidates.length) {
      this.controlled = candidates[0]
      this.selectionTimer = 0
    }
  }

  update(rawDt) {
    const frameDt = Math.min(Math.max(rawDt, 0), 0.25)
    this.time += frameDt
    this.shake = Math.max(0, this.shake - frameDt * 2.4)

    const steps = Math.max(1, Math.min(6, Math.ceil(frameDt / 0.034)))
    const dt = frameDt / steps

    if (this.state === 'playing') {
      for (let step = 0; step < steps && this.state === 'playing'; step += 1) {
        for (const player of this.players) {
          player.kickCd = Math.max(0, player.kickCd - dt)
        }
        this.updateInput(dt)
        this.updateAI(dt)
        this.integratePlayers(dt)
        this.separatePlayers()
        this.pushBall()
        this.updateBall(dt, false)
        this.updateSelection(dt)
      }
      if (this.state === 'playing') this.updateClock(frameDt)
    } else if (this.state === 'goal') {
      this.goalTimer -= frameDt
      for (let step = 0; step < steps; step += 1) {
        this.updateBall(dt, true)
        this.keepBallInNet()
      }
      if (this.goalTimer <= 0) {
        if (this.timeRemaining <= 0.001) {
          this.endMatch()
        } else {
          this.state = 'playing'
          this.scoringTeam = null
          this.resetPositions(this.concedingTeam || 'blue')
          this.controlled = this.pickNearestBlue()
          this.events.onState?.('playing')
        }
      }
    } else {
      for (const player of this.players) {
        player.vel.multiplyScalar(0.9)
      }
      for (let step = 0; step < Math.min(steps, 2); step += 1) {
        this.updateBall(dt, true)
      }
    }

    this.animatePlayers(frameDt)
    this.updateCamera(frameDt)
    this.syncMeshes()
    this.updateIndicator(frameDt)
  }

  updateInput(dt) {
    const player = this.controlled
    if (!player) {
      this.controlled = this.pickNearestBlue()
      return
    }

    const speed = player.baseSpeed * 1.04 * (this.input.sprint ? 1.38 : 1)
    const desiredX = this.input.x * speed
    const desiredZ = this.input.z * speed
    const smoothing = 1 - Math.exp(-dt * 11)
    player.vel.x += (desiredX - player.vel.x) * smoothing
    player.vel.z += (desiredZ - player.vel.z) * smoothing
  }

  updateAI(dt) {
    const ball = this.ball

    for (const player of this.players) {
      if (player === this.controlled) continue
      const attack = player.team === 'blue' ? 1 : -1

      if (player.role === 'GK') {
        this.updateKeeper(player, dt, attack)
        continue
      }

      const teammates = this.players.filter(
        (mate) => mate.team === player.team && mate.role !== 'GK' && mate !== this.controlled
      )
      let chaser = null
      let bestDistance = Infinity
      for (const mate of teammates) {
        const distance = mate.pos.distanceToSquared(ball.pos)
        if (distance < bestDistance) {
          bestDistance = distance
          chaser = mate
        }
      }

      let target
      if (player === chaser) {
        const goal = this.goalFor(player.team)
        const toGoal = this._scratch.set(goal.x - ball.pos.x, 0, goal.z - ball.pos.z)
        if (toGoal.lengthSq() > 0.0001) toGoal.normalize()
        const distanceToBall = horizontalDistance(player.pos, ball.pos)
        if (distanceToBall > 4.5) {
          target = this._scratch2.copy(ball.pos).addScaledVector(ball.vel, 0.18)
          target.y = 0
        } else {
          target = this._scratch2
            .copy(ball.pos)
            .addScaledVector(toGoal, -0.86)
          target.y = 0
        }
      } else {
        target = this.formationTarget(player, ball, attack)
      }

      this.moveToward(player, target, player.baseSpeed * this.difficulty.ai, dt)
      this.considerAIKick(player, attack)
    }
  }

  formationTarget(player, ball, attack) {
    const target = new THREE.Vector3()
    const ballAdvance = clamp(ball.pos.z * attack, -1, 1)

    if (player.role === 'DEF') {
      target.x = player.home.x * 0.75 + ball.pos.x * 0.22
      target.z = player.home.z + ballAdvance * 4 + ball.pos.z * 0.1
    } else if (player.role === 'MID') {
      target.x = player.home.x * 0.55 + ball.pos.x * 0.34
      target.z = player.home.z + ballAdvance * 6.5 + ball.pos.z * 0.12
    } else {
      target.x = player.home.x * 0.3 + ball.pos.x * 0.5
      target.z = player.home.z + ballAdvance * 8 + ball.pos.z * 0.15
    }

    const limitX = FIELD.halfWidth - 1.4
    const limitZ = FIELD.halfLength - 1.6
    target.x = clamp(target.x, -limitX, limitX)
    target.z = clamp(target.z, -limitZ, limitZ)
    target.y = 0
    return target
  }

  updateKeeper(player, dt, attack) {
    const ownGoalZ = -attack * (FIELD.halfLength - 1.3)
    const ballDistance = Math.hypot(this.ball.pos.x, this.ball.pos.z - ownGoalZ)

    let targetX = clamp(this.ball.pos.x * 0.45, -5.8, 5.8)
    let targetZ = ownGoalZ

    if (ballDistance < 13) {
      const rush = Math.min(5.4, (13 - ballDistance) * 0.55)
      targetZ = ownGoalZ + attack * rush
      targetX = clamp(this.ball.pos.x, -6.6, 6.6)
    }

    this.moveToward(player, { x: targetX, z: targetZ }, player.baseSpeed * this.difficulty.ai, dt)

    if (player.kickCd <= 0 && horizontalDistance(player.pos, this.ball.pos) < 1.5 && this.ball.pos.y < 1.7) {
      const directionX = (Math.random() - 0.5) * 0.5
      const power = 27
      this.ball.vel.set(directionX * power, 5.2, attack * power)
      player.kickCd = 1.4
      this.events.onKick?.('kick')
    }
  }

  moveToward(player, target, speed, dt) {
    const dx = target.x - player.pos.x
    const dz = target.z - player.pos.z
    const distance = Math.hypot(dx, dz)
    let desiredX = 0
    let desiredZ = 0

    if (distance > 0.16) {
      const step = Math.min(speed, (distance / Math.max(dt, 0.0001)) * 0.9)
      desiredX = (dx / distance) * step
      desiredZ = (dz / distance) * step
    }

    const smoothing = 1 - Math.exp(-dt * 9)
    player.vel.x += (desiredX - player.vel.x) * smoothing
    player.vel.z += (desiredZ - player.vel.z) * smoothing
  }

  integratePlayers(dt) {
    const limitX = FIELD.halfWidth - 0.9
    const limitZ = FIELD.halfLength - 0.9

    for (const player of this.players) {
      player.pos.x += player.vel.x * dt
      player.pos.z += player.vel.z * dt
      player.pos.x = clamp(player.pos.x, -limitX, limitX)
      player.pos.z = clamp(player.pos.z, -limitZ, limitZ)

      const speed = Math.hypot(player.vel.x, player.vel.z)
      if (speed > 0.4) {
        const targetAngle = Math.atan2(player.vel.x, player.vel.z)
        player.facing = lerpAngle(player.facing, targetAngle, 1 - Math.exp(-dt * 12))
        player.walkPhase += dt * (3.5 + speed * 1.15)
      } else {
        player.walkPhase += dt * 1.6
      }
    }
  }

  separatePlayers() {
    const limitX = FIELD.halfWidth - 0.9
    const limitZ = FIELD.halfLength - 0.9

    for (let i = 0; i < this.players.length; i += 1) {
      for (let j = i + 1; j < this.players.length; j += 1) {
        const a = this.players[i]
        const b = this.players[j]
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const distance = Math.hypot(dx, dz)
        if (distance > 1.02 || distance < 0.0001) continue

        const push = (1.02 - distance) * 0.5
        const nx = dx / distance
        const nz = dz / distance
        a.pos.x -= nx * push
        a.pos.z -= nz * push
        b.pos.x += nx * push
        b.pos.z += nz * push
        a.pos.x = clamp(a.pos.x, -limitX, limitX)
        a.pos.z = clamp(a.pos.z, -limitZ, limitZ)
        b.pos.x = clamp(b.pos.x, -limitX, limitX)
        b.pos.z = clamp(b.pos.z, -limitZ, limitZ)
      }
    }
  }

  pushBall() {
    const ball = this.ball
    if (ball.pos.y > 2.1) return

    for (const player of this.players) {
      const dx = ball.pos.x - player.pos.x
      const dz = ball.pos.z - player.pos.z
      const distance = Math.hypot(dx, dz)
      const minDistance = 0.93

      if (distance >= minDistance) continue

      const nx = distance > 0.0001 ? dx / distance : 0
      const nz = distance > 0.0001 ? dz / distance : 1
      ball.pos.x = player.pos.x + nx * minDistance
      ball.pos.z = player.pos.z + nz * minDistance

      const playerSpeed = Math.hypot(player.vel.x, player.vel.z)
      const ballSpeed = Math.hypot(ball.vel.x, ball.vel.z)
      if (ballSpeed > 17) continue

      if (playerSpeed > 1.15) {
        const push = Math.min(playerSpeed * 1.12, 12)
        ball.vel.x = player.vel.x * 1.08 + nx * 0.9
        ball.vel.z = player.vel.z * 1.08 + nz * 0.9
        const total = Math.hypot(ball.vel.x, ball.vel.z)
        if (total > push) {
          ball.vel.x = (ball.vel.x / total) * push
          ball.vel.z = (ball.vel.z / total) * push
        }
        ball.vel.y = Math.min(Math.max(ball.vel.y, 0), 0.9)
      } else {
        const along = ball.vel.x * nx + ball.vel.z * nz
        if (along < 0) {
          ball.vel.x -= 1.6 * along * nx
          ball.vel.z -= 1.6 * along * nz
        }
      }
    }
  }

  updateBall(dt, freezeBounds) {
    const ball = this.ball
    ball.vel.y -= 21 * dt

    const drag = Math.exp(-0.09 * dt)
    ball.vel.x *= drag
    ball.vel.z *= drag

    ball.pos.addScaledVector(ball.vel, dt)

    if (ball.pos.y < BALL_RADIUS) {
      ball.pos.y = BALL_RADIUS
      if (ball.vel.y < 0) {
        ball.vel.y = -ball.vel.y * 0.52
        if (Math.abs(ball.vel.y) < 1.3) ball.vel.y = 0
      }
    }

    if (ball.pos.y <= BALL_RADIUS + 0.015) {
      const friction = Math.exp(-0.62 * dt)
      ball.vel.x *= friction
      ball.vel.z *= friction
    }

    const speed = Math.hypot(ball.vel.x, ball.vel.z)
    const maxSpeed = 34
    if (speed > maxSpeed) {
      ball.vel.x = (ball.vel.x / speed) * maxSpeed
      ball.vel.z = (ball.vel.z / speed) * maxSpeed
    }

    const roll = Math.hypot(ball.vel.x, ball.vel.z)
    if (roll > 0.05) {
      const axis = this._scratch.set(ball.vel.z, 0, -ball.vel.x).normalize()
      ball.mesh.rotateOnWorldAxis(axis, (roll * dt) / BALL_RADIUS)
    }

    if (!freezeBounds && this.state === 'playing') {
      this.handleBounds()
    }
  }

  keepBallInNet() {
    const ball = this.ball
    const maxZ = FIELD.halfLength + FIELD.goalDepth - 0.4
    const sign = Math.sign(ball.pos.z) || 1

    if (Math.abs(ball.pos.z) > maxZ) {
      ball.pos.z = sign * maxZ
      ball.vel.z *= -0.18
    }
    if (Math.abs(ball.pos.x) > FIELD.goalHalfWidth + 0.35) {
      ball.pos.x = Math.sign(ball.pos.x) * (FIELD.goalHalfWidth + 0.35)
      ball.vel.x *= -0.18
    }
  }

  handleBounds() {
    const ball = this.ball

    if (
      Math.abs(ball.pos.z) > FIELD.halfLength - 0.16 &&
      Math.abs(ball.pos.x) < FIELD.goalHalfWidth - 0.04 &&
      ball.pos.y < FIELD.goalHeight - 0.05
    ) {
      this.registerGoal(ball.pos.z > 0 ? 'blue' : 'red')
      return
    }

    const limitX = FIELD.halfWidth - 0.5
    if (Math.abs(ball.pos.x) > limitX) {
      const sign = Math.sign(ball.pos.x)
      ball.pos.x = sign * limitX
      ball.vel.x = -sign * Math.abs(ball.vel.x) * 0.55
    }

    const limitZ = FIELD.halfLength - 0.5
    if (Math.abs(ball.pos.z) > limitZ) {
      const sign = Math.sign(ball.pos.z)
      ball.pos.z = sign * limitZ
      ball.vel.z = -sign * Math.abs(ball.vel.z) * 0.55
    }
  }

  registerGoal(scoringTeam) {
    if (this.state !== 'playing') return
    this.state = 'goal'
    this.scoringTeam = scoringTeam
    this.concedingTeam = scoringTeam === 'blue' ? 'red' : 'blue'
    this.score[scoringTeam] += 1
    this.goalTimer = 2.6
    this.shake = 0.85
    this.ball.vel.multiplyScalar(0.35)
    this.events.onScore?.(this.score.blue, this.score.red)
    this.events.onGoal?.(scoringTeam)
    this.events.onKick?.('goal')
  }

  updateSelection(dt) {
    this.selectionTimer += dt
    if (this.selectionTimer < 0.32) return
    this.selectionTimer = 0

    const nearest = this.pickNearestBlue()
    if (!nearest) return
    if (!this.controlled) {
      this.controlled = nearest
      return
    }
    if (nearest === this.controlled) return

    const currentDistance = horizontalDistance(this.controlled.pos, this.ball.pos)
    const nearestDistance = horizontalDistance(nearest.pos, this.ball.pos)
    if (nearestDistance + 2.6 < currentDistance || (currentDistance > 16 && nearestDistance < 9.5)) {
      this.controlled = nearest
    }
  }

  pickNearestBlue() {
    let best = null
    let bestDistance = Infinity
    for (const player of this.players) {
      if (player.team !== 'blue' || player.role === 'GK') continue
      const distance = horizontalDistance(player.pos, this.ball.pos)
      if (distance < bestDistance) {
        bestDistance = distance
        best = player
      }
    }
    return best
  }

  bestPassTarget(player) {
    const attack = player.team === 'blue' ? 1 : -1
    let best = null
    let bestScore = -Infinity
    for (const mate of this.players) {
      if (mate === player || mate.team !== player.team || mate.role === 'GK') continue
      const dx = mate.pos.x - this.ball.pos.x
      const dz = mate.pos.z - this.ball.pos.z
      const distance = Math.hypot(dx, dz)
      if (distance < 3 || distance > 27) continue
      const progress = (mate.pos.z - player.pos.z) * attack - distance * 0.15
      if (progress > bestScore) {
        bestScore = progress
        best = mate
      }
    }
    return best
  }

  considerAIKick(player, attack) {
    if (player.kickCd > 0) return
    const distanceToBall = horizontalDistance(player.pos, this.ball.pos)
    if (distanceToBall > 1.4 || this.ball.pos.y > 1.6) return

    const goal = this.goalFor(player.team)
    const distanceToGoal = Math.hypot(goal.x - this.ball.pos.x, goal.z - this.ball.pos.z)

    if (distanceToGoal < 26 && Math.random() < this.difficulty.shoot) {
      this.aiShoot(player, attack)
      return
    }

    if (this.underPressure(player) && Math.random() < 0.6) {
      const target = this.bestPassTarget(player)
      if (target) {
        this.aiPass(player, target)
        return
      }
    }

    const direction = this._scratch.set(goal.x - this.ball.pos.x, 0, goal.z - this.ball.pos.z)
    if (direction.lengthSq() > 0.001) {
      direction.normalize()
      this.ball.vel.x += direction.x * 2.4
      this.ball.vel.z += direction.z * 2.4
      this.ball.vel.y = Math.max(this.ball.vel.y, 0.35)
    }
    player.kickCd = 0.42
  }

  underPressure(player) {
    for (const opponent of this.players) {
      if (opponent.team === player.team) continue
      if (horizontalDistance(opponent.pos, player.pos) < 2.6) return true
    }
    return false
  }

  aiShoot(player, attack) {
    const error = (Math.random() - 0.5) * this.difficulty.error
    const targetX = clamp(this.ball.pos.x * 0.15 + (Math.random() - 0.5) * 4.4 + error, -3.1, 3.1)
    const targetZ = attack * (FIELD.halfLength + 0.4)
    const direction = this._scratch.set(targetX - this.ball.pos.x, 0, targetZ - this.ball.pos.z)
    if (direction.lengthSq() < 0.001) return
    direction.normalize()

    const power = 21 + Math.random() * 6
    this.ball.vel.set(direction.x * power, 3.2 + Math.random() * 2.6, direction.z * power)
    this.ball.pos.y = Math.max(this.ball.pos.y, BALL_RADIUS + 0.02)
    player.kickCd = 1.1 + Math.random() * 0.5
    this.events.onKick?.('kick')
  }

  aiPass(player, target) {
    const aim = this._scratch.set(
      target.pos.x + target.vel.x * 0.26 - this.ball.pos.x,
      0,
      target.pos.z + target.vel.z * 0.26 - this.ball.pos.z
    )
    if (aim.lengthSq() < 0.001) return
    aim.normalize()
    const distance = horizontalDistance(player.pos, target.pos)
    const power = clamp(distance * 1.1 + 5, 9, 23)
    this.ball.vel.set(aim.x * power, 2.1, aim.z * power)
    player.kickCd = 0.7 + Math.random() * 0.4
    this.events.onKick?.('pass')
  }

  goalFor(team) {
    return new THREE.Vector3(0, 0, (team === 'blue' ? 1 : -1) * (FIELD.halfLength + 0.5))
  }

  updateClock(dt) {
    this.timeRemaining = Math.max(0, this.timeRemaining - dt)
    const text = formatClock(this.timeRemaining)
    if (text !== this.lastClock) {
      this.lastClock = text
      this.events.onClock?.(text)
    }
    if (this.timeRemaining <= 0.001) {
      this.endMatch()
    }
  }

  endMatch() {
    if (this.state === 'ended') return
    this.state = 'ended'
    for (const player of this.players) player.vel.set(0, 0, 0)
    this.ball.vel.multiplyScalar(0.15)
    this.controlled = null
    this.events.onEnd?.(this.score.blue, this.score.red)
    this.events.onKick?.('whistle')
    this.events.onState?.('ended')
  }

  animatePlayers(dt) {
    const celebrating = this.state === 'goal' && this.scoringTeam

    for (const player of this.players) {
      const speed = Math.hypot(player.vel.x, player.vel.z)
      const swingTarget = Math.min(0.85, speed * 0.085)
      player.swing += (swingTarget - player.swing) * Math.min(1, dt * 10)

      const swing = Math.sin(player.walkPhase) * player.swing
      player.parts.leftLeg.rotation.x = swing
      player.parts.rightLeg.rotation.x = -swing
      player.parts.leftArm.rotation.x = -swing * 0.72
      player.parts.rightArm.rotation.x = swing * 0.72

      let bob = Math.abs(Math.sin(player.walkPhase)) * 0.018 * Math.min(1, speed / 4)

      if (celebrating && player.team === this.scoringTeam) {
        bob = Math.abs(Math.sin(this.time * 6.5 + player.index * 1.4)) * 0.42
        player.parts.leftArm.rotation.z = 2.35
        player.parts.rightArm.rotation.z = -2.35
      } else {
        player.parts.leftArm.rotation.z = 0.18
        player.parts.rightArm.rotation.z = -0.18
      }

      player.bob = bob
    }
  }

  syncMeshes() {
    const cameraCutoff = this.camera.position.z + 0.9

    for (const player of this.players) {
      const visible = player.pos.z > cameraCutoff
      player.mesh.visible = visible
      player.shadow.visible = visible
      player.mesh.position.set(player.pos.x, player.bob || 0, player.pos.z)
      player.mesh.rotation.y = player.facing
      player.shadow.position.set(player.pos.x, 0.045, player.pos.z)
      player.shadow.material.opacity = 0.3 - Math.min(0.14, (player.bob || 0) * 0.25)
    }

    this.ball.mesh.position.copy(this.ball.pos)
    this.ballShadow.position.set(this.ball.pos.x, 0.05, this.ball.pos.z)
    const height = Math.max(0, this.ball.pos.y - BALL_RADIUS)
    const scale = clamp(1 - height * 0.12, 0.45, 1)
    this.ballShadow.scale.setScalar(scale)
    this.ballShadow.material.opacity = clamp(0.3 - height * 0.035, 0.08, 0.3)
  }

  updateCamera(dt) {
    const ball = this.ball.pos

    if (this.state === 'menu' || this.state === 'ended') {
      const angle = this.time * 0.12
      const target = this._scratch.set(Math.sin(angle) * 20, 23, -30 + Math.cos(angle) * 6)
      this.camera.position.lerp(target, 1 - Math.exp(-dt * 1.6))
      this.lookTarget.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-dt * 2))
      this.camera.lookAt(this.lookTarget)
      return
    }

    const portrait = this.camera.aspect < 0.8
    const distance = portrait ? 30 : 24
    const height = portrait ? 31 : 24

    const idealX = clamp(ball.x * 0.52, -11, 11)
    const idealZ = clamp(ball.z - distance, -FIELD.halfLength - 4.5, FIELD.halfLength - 12)
    const idealY = height

    const smoothing = 1 - Math.exp(-dt * 3.4)
    this.camera.position.x += (idealX - this.camera.position.x) * smoothing
    this.camera.position.y += (idealY - this.camera.position.y) * smoothing
    this.camera.position.z += (idealZ - this.camera.position.z) * smoothing

    const look = this._scratch.set(ball.x * 0.78, 0.55, ball.z * 0.56 + 4.2)
    this.lookTarget.lerp(look, 1 - Math.exp(-dt * 4.4))
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.7
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.45
    }
    this.camera.lookAt(this.lookTarget)
  }

  updateIndicator(dt) {
    const player = this.controlled
    const show =
      this.state === 'playing' &&
      Boolean(player) &&
      player.pos.z > this.camera.position.z + 0.9
    this.ring.visible = show
    this.chevron.visible = show
    if (!show) return

    this.ring.position.set(player.pos.x, 0.075, player.pos.z)
    this.ring.material.opacity = 0.55 + Math.sin(this.time * 6) * 0.22
    const scale = 1 + Math.sin(this.time * 4.4) * 0.06
    this.ring.scale.setScalar(scale)

    this.chevron.position.set(
      player.pos.x,
      2.28 + Math.sin(this.time * 4.2) * 0.08,
      player.pos.z
    )
    this.chevron.rotation.y = player.facing
  }
}

function clampPlayer(player) {
  const limitX = FIELD.halfWidth - 0.9
  const limitZ = FIELD.halfLength - 0.9
  player.pos.x = clamp(player.pos.x, -limitX, limitX)
  player.pos.z = clamp(player.pos.z, -limitZ, limitZ)
}
