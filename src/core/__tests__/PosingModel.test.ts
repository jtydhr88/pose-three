import * as THREE from 'three'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { PosingModel } from '../PosingModel'
import type { ModelConfig } from '../types'
import { buildHumanoid } from './fixtures'

const CONFIG: ModelConfig = { boneSize: 1, handBoneSize: 0.5, hipBoneSize: 2, hipBoneName: 'Hips' }

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PosingModel construction', () => {
  it('discovers the skinned mesh and builds IK + FK + root controllers', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)

    expect(pm.skinnedMeshes).toHaveLength(1)
    expect(pm.boneControllers.some((c) => c.name === 'BoneControllerIK')).toBe(true)
    expect(pm.boneControllers.some((c) => c.name === 'BoneController')).toBe(true)
    expect(pm.ikSolvers.length).toBeGreaterThan(0)
    expect(pm.modelRootController).not.toBeNull()
  })

  it('creates virtual IK targets when none exist', () => {
    const h = buildHumanoid({ withIKTargets: false })
    const pm = new PosingModel(h.group, CONFIG)
    const created = h.mesh.skeleton.bones.filter((b) => b.name.endsWith('_IKTarget'))
    expect(created.length).toBeGreaterThan(0)
    expect(pm.ikSolvers.length).toBeGreaterThan(0)
  })

  it('uses existing IK target bones when present', () => {
    const h = buildHumanoid({ withIKTargets: true })
    const pm = new PosingModel(h.group, CONFIG)
    expect(pm.ikSolvers.length).toBeGreaterThan(0)
  })

  it('handles a model with no skinned mesh gracefully', () => {
    const pm = new PosingModel(new THREE.Group(), CONFIG)
    expect(pm.skinnedMeshes).toHaveLength(0)
    expect(pm.boneControllers).toHaveLength(0)
  })

  it('cannot build virtual targets without a Hips bone', () => {

    const arm = new THREE.Bone()
    arm.name = 'LeftArm'
    const fore = new THREE.Bone()
    fore.name = 'LeftForeArm'
    arm.add(fore)
    const hand = new THREE.Bone()
    hand.name = 'LeftHand'
    fore.add(hand)
    const geom = new THREE.BoxGeometry(1, 1, 1)
    const vc = geom.getAttribute('position').count
    const si: number[] = []
    const sw: number[] = []
    for (let i = 0; i < vc; i++) {
      si.push(0, 0, 0, 0)
      sw.push(1, 0, 0, 0)
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
    const mesh = new THREE.SkinnedMesh(geom, new THREE.MeshBasicMaterial())
    mesh.add(arm)
    mesh.bind(new THREE.Skeleton([arm, fore, hand]))
    const group = new THREE.Group()
    group.add(mesh)
    const pm = new PosingModel(group, CONFIG)

    expect(pm.ikSolvers).toHaveLength(0)
  })
})

describe('controller visibility', () => {
  it('toggles IK / FK / root controller visibility', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)

    pm.showIKControllers(true)
    expect(pm.boneControllers.filter((c) => c.name === 'BoneControllerIK').every((c) => c.visible)).toBe(true)
    pm.showIKControllers(false)
    expect(pm.boneControllers.filter((c) => c.name === 'BoneControllerIK').every((c) => !c.visible)).toBe(true)

    pm.showFKControllers(true)
    expect(pm.boneControllers.filter((c) => c.name === 'BoneController').every((c) => c.visible)).toBe(true)

    pm.showModelRootController(true)
    expect(pm.modelRootController!.visible).toBe(true)
    pm.showModelRootController(false)
    expect(pm.modelRootController!.visible).toBe(false)
  })
})

describe('pose reset', () => {
  it('resetPose restores every bone to its original transform', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    const spine = h.bones['Spine']
    const original = spine.rotation.x

    spine.rotation.x = 1.234
    pm.resetPose()
    expect(spine.rotation.x).toBeCloseTo(original)
  })

  it('resetBone restores a single bone', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    const head = h.bones['Head']
    head.rotation.z = 0.9
    pm.resetBone(head)
    expect(head.rotation.z).toBeCloseTo(0)
  })

  it('resetBone warns for an unknown bone', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    const stray = new THREE.Bone()
    expect(() => pm.resetBone(stray)).not.toThrow()
  })
})

describe('updateIK', () => {
  it('runs all solvers without throwing', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    expect(() => pm.updateIK()).not.toThrow()
  })
})

describe('pose load / serialize', () => {
  it('applies rotation/position/quaternion/scale from JSON', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    pm.loadPoseFromJSON({
      bones: [
        {
          mixamorigSpine: { rotation: { x: 0.5, y: 0, z: 0 } },
          mixamorigHips: {
            position: { x: 1, y: 2, z: 3 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 2, y: 2, z: 2 },
          },
        },
      ],
    })
    expect(h.bones['Spine'].rotation.x).toBeCloseTo(0.5)
    expect(h.bones['Hips'].position.x).toBeCloseTo(1)
    expect(h.bones['Hips'].scale.y).toBeCloseTo(2)
  })

  it('normalizes mixamorig1 bone names', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    pm.loadPoseFromJSON({ bones: [{ mixamorig1Spine: { rotation: { x: 0.3, y: 0, z: 0 } } }] })
    expect(h.bones['Spine'].rotation.x).toBeCloseTo(0.3)
  })

  it('ignores invalid pose data', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    // @ts-expect-error intentional invalid input
    expect(() => pm.loadPoseFromJSON({})).not.toThrow()
    // @ts-expect-error intentional invalid input
    expect(() => pm.loadPoseFromJSON(null)).not.toThrow()
  })

  it('round-trips through serializeToJSON', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    h.bones['Spine'].rotation.x = 0.42
    const data = pm.serializeToJSON()
    expect(data.bones).toHaveLength(1)
    expect(data.bones[0]['mixamorigSpine'].rotation!.x).toBeCloseTo(0.42)

    h.bones['Spine'].rotation.x = 0
    pm.loadPoseFromJSON(data)
    expect(h.bones['Spine'].rotation.x).toBeCloseTo(0.42)
  })
})

describe('hand pose', () => {
  it('applies a hand pose to the same hand', () => {
    const h = buildHumanoid({ includeHands: true })
    const pm = new PosingModel(h.group, CONFIG)
    pm.loadHandPoseFromJSON(
      { bones: [{ mixamorigLeftHandThumb1: { rotation: { x: 0.7, y: 0, z: 0 } } }] },
      'left',
      'left'
    )
    expect(h.bones['LeftHandThumb1'].rotation.x).toBeCloseTo(0.7)
  })

  it('mirrors a hand pose across hands', () => {
    const h = buildHumanoid({ includeHands: true })
    const pm = new PosingModel(h.group, CONFIG)
    pm.loadHandPoseFromJSON(
      { bones: [{ mixamorigRightHandIndex1: { rotation: { x: 0.2, y: 0.5, z: 0.3 } } }] },
      'right',
      'left'
    )

    expect(h.bones['RightHandIndex1'].rotation.x).toBeCloseTo(0.2)
    expect(h.bones['RightHandIndex1'].rotation.y).toBeCloseTo(-0.5)
    expect(h.bones['RightHandIndex1'].rotation.z).toBeCloseTo(-0.3)
  })

  it('rejects invalid hand arguments and data', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    // @ts-expect-error invalid hand
    expect(() => pm.loadHandPoseFromJSON({ bones: [{}] }, 'middle', 'left')).not.toThrow()
    // @ts-expect-error invalid data
    expect(() => pm.loadHandPoseFromJSON(null, 'left', 'left')).not.toThrow()
  })
})

describe('dispose', () => {
  it('disposes controller geometries and materials', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    const sample = pm.boneControllers[0]
    const geoSpy = vi.spyOn(sample.geometry, 'dispose')
    expect(() => pm.dispose()).not.toThrow()
    expect(geoSpy).toHaveBeenCalled()
  })
})
