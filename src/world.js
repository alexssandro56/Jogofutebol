import * as THREE from 'three'

export const FIELD = {
  halfWidth: 20,
  halfLength: 33,
  goalHalfWidth: 3.66,
  goalHeight: 2.44,
  goalDepth: 2.4,
  planeWidth: 46,
  planeLength: 72,
  ballRadius: 0.36
}

export function createWorld(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x050d16)
  scene.fog = new THREE.Fog(0x050d16, 85, 210)

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500)
  camera.position.set(0, 26, -30)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.domElement.id = 'game-canvas'
  container.appendChild(renderer.domElement)

  addLights(scene)
  addGround(scene)
  addPitch(scene)
  addBoards(scene)
  addStands(scene)
  addFloodlights(scene)
  addGoal(scene, -1)
  addGoal(scene, 1)

  const resize = () => {
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    const aspect = width / height
    camera.aspect = aspect
    camera.fov = aspect < 0.8 ? 68 : aspect < 1.2 ? 58 : 52
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }

  window.addEventListener('resize', resize)
  resize()

  return { scene, camera, renderer, resize }
}

function addLights(scene) {
  const hemi = new THREE.HemisphereLight(0xbfe9ff, 0x0d2a1d, 1.35)
  scene.add(hemi)

  const key = new THREE.DirectionalLight(0xfff5e6, 2.5)
  key.position.set(34, 58, 22)
  scene.add(key)

  const fill = new THREE.DirectionalLight(0x7fb9ff, 1.1)
  fill.position.set(-30, 34, -28)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0x9dffb8, 0.55)
  rim.position.set(0, 18, -60)
  scene.add(rim)
}

function addGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({ color: 0x0b1c17, roughness: 1 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.09
  scene.add(ground)
}

function addPitch(scene) {
  const texture = makePitchTexture()
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.planeWidth, FIELD.planeLength),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.94, metalness: 0 })
  )
  mesh.rotation.x = -Math.PI / 2
  scene.add(mesh)
}

function makePitchTexture() {
  const W = 1012
  const H = 1584
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const px = (x) => ((x + FIELD.planeWidth / 2) / FIELD.planeWidth) * W
  const py = (z) => ((z + FIELD.planeLength / 2) / FIELD.planeLength) * H
  const sx = W / FIELD.planeWidth
  const sz = H / FIELD.planeLength

  const band = 6
  for (let z = -FIELD.planeLength / 2, i = 0; z < FIELD.planeLength / 2; z += band, i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#1d7a41' : '#1a6d3a'
    ctx.fillRect(0, py(z), W, py(z + band) - py(z) + 1)
  }

  const glow = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.62)
  glow.addColorStop(0, 'rgba(255,255,255,0.10)')
  glow.addColorStop(1, 'rgba(0,0,0,0.20)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(245, 252, 240, 0.92)'
  ctx.fillStyle = 'rgba(245, 252, 240, 0.92)'
  ctx.lineWidth = 4.5
  ctx.lineCap = 'butt'

  const hw = FIELD.halfWidth
  const hl = FIELD.halfLength
  const line = (x1, z1, x2, z2) => {
    ctx.beginPath()
    ctx.moveTo(px(x1), py(z1))
    ctx.lineTo(px(x2), py(z2))
    ctx.stroke()
  }

  line(-hw, -hl, hw, -hl)
  line(-hw, hl, hw, hl)
  line(-hw, -hl, -hw, hl)
  line(hw, -hl, hw, hl)
  line(-hw, 0, hw, 0)

  ctx.beginPath()
  ctx.arc(px(0), py(0), 8 * sx, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(px(0), py(0), 0.35 * sx, 0, Math.PI * 2)
  ctx.fill()

  for (const side of [-1, 1]) {
    const goalLine = side * hl
    const boxDepth = 11 * side
    const boxHalf = 12
    ctx.strokeRect(
      px(-boxHalf),
      Math.min(py(goalLine), py(goalLine - boxDepth)),
      px(boxHalf) - px(-boxHalf),
      Math.abs(py(goalLine - boxDepth) - py(goalLine))
    )

    const smallHalf = 6
    const smallDepth = 4 * side
    ctx.strokeRect(
      px(-smallHalf),
      Math.min(py(goalLine), py(goalLine - smallDepth)),
      px(smallHalf) - px(-smallHalf),
      Math.abs(py(goalLine - smallDepth) - py(goalLine))
    )

    const spotZ = goalLine - 9 * side
    ctx.beginPath()
    ctx.arc(px(0), py(spotZ), 0.28 * sx, 0, Math.PI * 2)
    ctx.fill()

    const arcCenterZ = goalLine - 9 * side
    ctx.beginPath()
    if (side < 0) ctx.arc(px(0), py(arcCenterZ), 7.3 * sx, Math.PI * 1.18, Math.PI * 1.82)
    else ctx.arc(px(0), py(arcCenterZ), 7.3 * sx, Math.PI * 0.18, Math.PI * 0.82)
    ctx.stroke()
  }

  for (const cornerX of [-hw, hw]) {
    for (const cornerZ of [-hl, hl]) {
      ctx.beginPath()
      ctx.arc(px(cornerX), py(cornerZ), 1.4 * sx, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  for (let i = 0; i < 800; i += 1) {
    const x = Math.random() * W
    const y = Math.random() * H
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`
    ctx.fillRect(x, y, 2, 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function addBoards(scene) {
  const makePanel = (width, repeat) => {
    const texture = makeBoardTexture(repeat)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 1.5),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    )
    return mesh
  }

  for (const side of [-1, 1]) {
    const panel = makePanel(FIELD.planeLength - 6, 5)
    panel.position.set(side * (FIELD.planeWidth / 2 + 1.2), 1.05, 0)
    panel.rotation.y = side * -Math.PI / 2
    scene.add(panel)
  }

  for (const side of [-1, 1]) {
    const panel = makePanel(FIELD.planeWidth + 4, 4)
    panel.position.set(0, 1.05, side * (FIELD.halfLength + 3.7))
    panel.rotation.y = side < 0 ? Math.PI : 0
    scene.add(panel)
  }
}

function makeBoardTexture(repeat) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
  gradient.addColorStop(0, '#081826')
  gradient.addColorStop(0.5, '#0d2438')
  gradient.addColorStop(1, '#081826')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#4ce4ff'
  ctx.fillRect(0, 0, canvas.width, 5)
  ctx.fillStyle = '#b8ff4a'
  ctx.fillRect(0, canvas.height - 5, canvas.width, 5)

  ctx.font = '900 46px Inter, Arial, sans-serif'
  ctx.textBaseline = 'middle'
  const words = ['JOGO DE FUTEBOL', 'ARENA 3D', 'OMGITHUB']
  let x = 30
  let index = 0
  while (x < canvas.width + 300) {
    const word = words[index % words.length]
    ctx.fillStyle = index % 3 === 1 ? '#b8ff4a' : '#8fe9ff'
    ctx.fillText(word, x, canvas.height / 2)
    x += ctx.measureText(word).width + 34
    ctx.fillStyle = '#ff4d5e'
    ctx.beginPath()
    ctx.arc(x - 12, canvas.height / 2, 5, 0, Math.PI * 2)
    ctx.fill()
    x += 20
    index += 1
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.set(repeat, 1)
  return texture
}

function crowdTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0c1620'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const colors = ['#dbe9f5', '#4ce4ff', '#2f7bff', '#ff4d5e', '#ffd166', '#b8ff4a', '#334a63']
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
    ctx.globalAlpha = 0.35 + Math.random() * 0.6
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const r = 0.8 + Math.random() * 2.1
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(9, 1)
  return texture
}

function addStands(scene) {
  const crowd = crowdTexture()
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.96 })
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x111d29, roughness: 0.92 })
  const materialsFor = (innerIndex) => {
    const list = []
    for (let i = 0; i < 6; i += 1) list.push(i === innerIndex ? crowdMat : concreteMat)
    return list
  }

  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(5.5, 2.7, 82 - tier * 3),
        materialsFor(side > 0 ? 1 : 0)
      )
      mesh.position.set(side * (26 + tier * 4.4), 1.35 + tier * 2.7, 0)
      scene.add(mesh)
    }
  }

  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(66 - tier * 4, 2.7, 5.5),
        materialsFor(side > 0 ? 5 : 4)
      )
      mesh.position.set(0, 1.35 + tier * 2.7, side * (39 + tier * 4.4))
      scene.add(mesh)
    }
  }

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(120, 3.2, 1.2), concreteMat)
  backWall.position.set(0, 1.6, -50)
  scene.add(backWall)
}

function addFloodlights(scene) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x24313f, roughness: 0.6, metalness: 0.4 })
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xcfe9ff,
    emissiveIntensity: 2.4,
    roughness: 0.3
  })

  for (const x of [-30, 30]) {
    for (const z of [-40, 40]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.46, 24, 8), poleMat)
      pole.position.set(x, 12, z)
      scene.add(pole)

      const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 0.5), panelMat)
      panel.position.set(x, 24, z)
      panel.lookAt(0, 0, 0)
      scene.add(panel)
    }
  }
}

function addGoal(scene, side) {
  const z = side * FIELD.halfLength
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf5fbff, roughness: 0.35, metalness: 0.15 })
  const postGeo = new THREE.CylinderGeometry(0.1, 0.1, FIELD.goalHeight, 10)

  for (const x of [-FIELD.goalHalfWidth, FIELD.goalHalfWidth]) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(x, FIELD.goalHeight / 2, z)
    scene.add(post)
  }

  const crossbar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, FIELD.goalHalfWidth * 2 + 0.18, 10),
    postMat
  )
  crossbar.rotation.z = Math.PI / 2
  crossbar.position.set(0, FIELD.goalHeight, z)
  scene.add(crossbar)

  const backZ = z + side * FIELD.goalDepth
  const backBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, FIELD.goalHalfWidth * 2, 8),
    postMat
  )
  backBar.rotation.z = Math.PI / 2
  backBar.position.set(0, 0.06, backZ)
  scene.add(backBar)

  for (const x of [-FIELD.goalHalfWidth, FIELD.goalHalfWidth]) {
    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, FIELD.goalDepth + 0.15, 8),
      postMat
    )
    support.rotation.x = Math.PI / 2
    support.position.set(x, 0.06, z + side * (FIELD.goalDepth / 2))
    scene.add(support)
  }

  const positions = []
  const gx = FIELD.goalHalfWidth
  const gh = FIELD.goalHeight
  const depth = FIELD.goalDepth

  for (let x = -gx; x <= gx + 0.01; x += gx / 6) {
    positions.push(x, 0, backZ, x, gh, backZ)
  }
  for (let y = 0; y <= gh + 0.01; y += gh / 5) {
    positions.push(-gx, y, backZ, gx, y, backZ)
  }
  for (const x of [-gx, gx]) {
    for (let y = 0; y <= gh + 0.01; y += gh / 5) {
      positions.push(x, y, z, x, y, backZ)
    }
    for (let d = 0; d <= depth + 0.01; d += depth / 4) {
      positions.push(x, 0, z + side * d, x, gh, z + side * d)
    }
  }
  for (let x = -gx; x <= gx + 0.01; x += gx / 6) {
    positions.push(x, gh, z, x, gh, backZ)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const net = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.26 })
  )
  scene.add(net)
}

export function createBallMesh() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(FIELD.ballRadius, 28, 20),
    new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.42, metalness: 0.02 })
  )
  return mesh
}

function makeBallTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f8faf7'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(90, 100, 105, 0.5)'
  ctx.lineWidth = 2
  for (let i = 0; i < 16; i += 1) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    ctx.beginPath()
    ctx.arc(x, y, 26 + Math.random() * 22, 0, Math.PI * 2)
    ctx.stroke()
  }

  for (let i = 0; i < 12; i += 1) {
    const cx = (i + 0.5) * (canvas.width / 12)
    const cy = i % 2 === 0 ? canvas.height * 0.3 : canvas.height * 0.7
    const r = 22 + Math.random() * 9
    ctx.fillStyle = '#101418'
    ctx.beginPath()
    for (let p = 0; p < 5; p += 1) {
      const angle = (p / 5) * Math.PI * 2 - Math.PI / 2
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (p === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

const SKIN_TONES = ['#f1c8a4', '#d9a173', '#b97d52', '#8d5a3b', '#e8b98f', '#a86c43']
const HAIR_COLORS = ['#151210', '#241a12', '#3a2a1d', '#0d0b0a', '#523420']

export function createPlayerMesh(team, role, number, index) {
  const isBlue = team === 'blue'
  const kitColor = role === 'GK' ? (isBlue ? 0xc8ff45 : 0xffb020) : isBlue ? 0x2f7bff : 0xff3d50
  const shortsColor = role === 'GK' ? (isBlue ? 0x3d5c10 : 0x6b4300) : isBlue ? 0x0a2a66 : 0x5c0b16
  const skin = SKIN_TONES[index % SKIN_TONES.length]
  const hair = HAIR_COLORS[index % HAIR_COLORS.length]

  const kitMat = new THREE.MeshStandardMaterial({ color: kitColor, roughness: 0.62, metalness: 0.04 })
  const shortsMat = new THREE.MeshStandardMaterial({ color: shortsColor, roughness: 0.72 })
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.82 })
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 })
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x10151a, roughness: 0.6 })

  const group = new THREE.Group()
  group.scale.setScalar(0.95)

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.5, 5, 12), kitMat)
  torso.position.y = 1.2
  group.add(torso)

  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.245, 0.3, 12), shortsMat)
  shorts.position.y = 0.77
  group.add(shorts)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skinMat)
  head.position.y = 1.87
  group.add(head)

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.206, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat
  )
  hairCap.position.y = 1.89
  group.add(hairCap)

  const makeLimb = (radius, length, material) => {
    const geometry = new THREE.CylinderGeometry(radius, radius * 0.82, length, 8)
    geometry.translate(0, -length / 2, 0)
    return new THREE.Mesh(geometry, material)
  }

  const leftLeg = makeLimb(0.088, 0.62, shortsMat)
  leftLeg.position.set(-0.14, 0.72, 0)
  group.add(leftLeg)

  const rightLeg = makeLimb(0.088, 0.62, shortsMat)
  rightLeg.position.set(0.14, 0.72, 0)
  group.add(rightLeg)

  for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), bootMat)
    boot.position.set(0, -0.62, 0.07)
    leg.add(boot)
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.082, 0.24, 8), kitMat)
    sock.position.set(0, -0.42, 0)
    leg.add(sock)
    leg.userData.side = side
  }

  const leftArm = makeLimb(0.07, 0.52, skinMat)
  leftArm.position.set(-0.31, 1.55, 0)
  leftArm.rotation.z = 0.18
  group.add(leftArm)

  const rightArm = makeLimb(0.07, 0.52, skinMat)
  rightArm.position.set(0.31, 1.55, 0)
  rightArm.rotation.z = -0.18
  group.add(rightArm)

  for (const arm of [leftArm, rightArm]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.082, 0.18, 8), kitMat)
    sleeve.position.set(0, -0.06, 0)
    arm.add(sleeve)
  }

  const numberTexture = makeNumberTexture(number)
  const numberPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.46),
    new THREE.MeshBasicMaterial({ map: numberTexture, transparent: true, depthWrite: false })
  )
  numberPlane.position.set(0, 1.32, -0.285)
  numberPlane.rotation.y = Math.PI
  group.add(numberPlane)

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 22),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.045

  return {
    group,
    shadow,
    parts: { torso, head, leftLeg, rightLeg, leftArm, rightArm }
  }
}

function makeNumberTexture(number) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '900 96px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 12
  ctx.strokeStyle = 'rgba(4, 12, 22, 0.85)'
  ctx.strokeText(String(number), canvas.width / 2, canvas.height / 2)
  ctx.fillStyle = '#f6fbff'
  ctx.fillText(String(number), canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
