import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import type { EmblemState } from '../../../shared/types'
import { cameraFor, createBlinker, expressionWeights, gazeOffset, type Framing, type Vec3 } from './avatarLogic'

export interface AvatarScene {
  /** Resolves once the model is loaded; rejects if it can't be. */
  ready: Promise<void>
  setState(s: EmblemState): void
  setLevel(level: number): void
  setFraming(f: Framing): void
  dispose(): void
}

/** Renders a VRM model into `canvas` with a transparent background, blinking, lip-sync and idle motion. */
export function createAvatarScene(canvas: HTMLCanvasElement, url: string): AvatarScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
  scene.add(camera)
  const key = new THREE.DirectionalLight(0xffffff, Math.PI * 0.9)
  key.position.set(0.6, 1.2, 1.5)
  scene.add(key, new THREE.AmbientLight(0xbfd8ff, 0.6))

  // Gaze target lives in camera space: (0,0,0) means "look at the viewer".
  const gaze = new THREE.Object3D()
  camera.add(gaze)

  let vrm: VRM | null = null
  let head: Vec3 = { x: 0, y: 1.4, z: 0 }
  let state: EmblemState = 'idle'
  let level = 0
  let smoothedLevel = 0
  let framing: Framing = 'full'
  const camPos = new THREE.Vector3()
  const camTarget = new THREE.Vector3()
  let camFov = 30
  let snapCamera = true
  const blinker = createBlinker()
  const clock = new THREE.Clock()

  const fit = (): void => {
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const resizeObserver = new ResizeObserver(fit)
  resizeObserver.observe(canvas)
  fit()

  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const ready = loader.loadAsync(url).then((gltf) => {
    const loaded = gltf.userData.vrm as VRM | undefined
    if (!loaded) throw new Error('not a VRM file')
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    VRMUtils.combineMorphs(loaded)
    VRMUtils.rotateVRM0(loaded) // VRM 0.x models face -Z; normalise to +Z
    loaded.scene.traverse((o) => (o.frustumCulled = false))
    scene.add(loaded.scene)
    loaded.lookAt && (loaded.lookAt.target = gaze)

    // Relax the arms out of the T-pose.
    loaded.humanoid.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.2)
    loaded.humanoid.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.2)
    loaded.update(0)

    const p = new THREE.Vector3()
    loaded.humanoid.getRawBoneNode('head')?.getWorldPosition(p)
    head = { x: p.x, y: p.y, z: p.z }
    vrm = loaded
    snapCamera = true
  })

  let frame = 0
  const tick = (): void => {
    frame = requestAnimationFrame(tick)
    const dt = Math.min(clock.getDelta(), 0.1)
    const t = clock.elapsedTime

    // Camera eases between framings (snaps on first frame after load).
    const c = cameraFor(framing, head)
    const k = snapCamera ? 1 : 1 - Math.pow(0.001, dt) // ~frame-rate independent easing
    camPos.lerp(new THREE.Vector3(c.position.x, c.position.y, c.position.z), k)
    camTarget.lerp(new THREE.Vector3(c.target.x, c.target.y, c.target.z), k)
    camFov += (c.fov - camFov) * k
    snapCamera = false
    camera.position.copy(camPos)
    camera.fov = camFov
    camera.updateProjectionMatrix()
    camera.lookAt(camTarget)

    if (vrm) {
      smoothedLevel += (level - smoothedLevel) * 0.35
      const weights = expressionWeights(state, smoothedLevel, blinker.weightAt(t))
      for (const [name, w] of Object.entries(weights)) vrm.expressionManager?.setValue(name, w)

      const g = gazeOffset(state)
      gaze.position.set(g.x, g.y, 0)

      // Idle life: slow breathing and a gentle head sway.
      const h = vrm.humanoid
      h.getNormalizedBoneNode('chest')?.rotation.set(Math.sin(t * 1.4) * 0.015, 0, 0)
      h.getNormalizedBoneNode('neck')?.rotation.set(0, Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.23) * 0.02)
      vrm.update(dt)
    }
    renderer.render(scene, camera)
  }
  tick()

  return {
    ready,
    setState: (s) => {
      state = s
    },
    setLevel: (l) => {
      level = l
    },
    setFraming: (f) => {
      framing = f
    },
    dispose: () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      if (vrm) VRMUtils.deepDispose(vrm.scene)
      renderer.dispose()
    }
  }
}
