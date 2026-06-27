import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CCDIKSolver } from '../CCDIKSolver'
import type { IKConfig } from '../types'
import { buildHumanoid } from './fixtures'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function setup(targetWorld: [number, number, number]) {
  const h = buildHumanoid()
  const bones = h.mesh.skeleton.bones
  const idx = (suffix: string) => bones.findIndex((b) => b.name.endsWith(suffix))

  const effector = idx('LeftHand')
  const foreArm = idx('LeftForeArm')
  const arm = idx('LeftArm')

  const targetBone = new THREE.Bone()
  targetBone.name = 'TestTarget'
  targetBone.position.set(targetWorld[0], targetWorld[1], targetWorld[2])
  h.group.add(targetBone)
  bones.push(targetBone)
  const target = bones.length - 1

  h.group.updateMatrixWorld(true)

  const effectorWorld = () => new THREE.Vector3().setFromMatrixPosition(bones[effector].matrixWorld)
  const targetPos = () => new THREE.Vector3().setFromMatrixPosition(targetBone.matrixWorld)

  return { h, bones, effector, foreArm, arm, target, targetBone, effectorWorld, targetPos }
}

describe('CCDIKSolver construction / _valid', () => {
  it('does not warn for a well-formed parent chain', () => {
    const { h, effector, foreArm, arm, target } = setup([-35, 100, 30])
    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: foreArm }, { index: arm }],
    }

    new CCDIKSolver(h.mesh, [ik])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('warns when a link is not the parent of the previous bone', () => {
    const { h, bones, effector, arm, target } = setup([-35, 100, 30])

    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: arm }],
    }

    new CCDIKSolver(h.mesh, [ik])
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect((console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      'is not the child of bone'
    )
    expect(bones).toBeTruthy()
  })

  it('defaults iks to an empty array', () => {
    const { h } = setup([0, 0, 0])
    const solver = new CCDIKSolver(h.mesh)
    expect(solver.iks).toEqual([])

    expect(solver.update()).toBe(solver)
  })
})

describe('CCDIKSolver.update', () => {
  it('rotates links so the effector moves toward the target', () => {
    const { h, bones, effector, foreArm, arm, target, effectorWorld, targetPos } = setup([
      0, 60, 40,
    ])
    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: foreArm }, { index: arm }],
      iteration: 10,
    }
    const solver = new CCDIKSolver(h.mesh, [ik])

    const beforeForeArm = bones[foreArm].quaternion.clone()
    const beforeDist = effectorWorld().distanceTo(targetPos())

    solver.update()

    const afterDist = effectorWorld().distanceTo(targetPos())

    expect(bones[foreArm].quaternion.angleTo(beforeForeArm)).toBeGreaterThan(1e-4)

    expect(afterDist).toBeLessThan(beforeDist)
  })

  it('update() iterates over every configured IK chain', () => {
    const { h, effector, foreArm, arm, target } = setup([0, 60, 40])
    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: foreArm }, { index: arm }],
    }
    const solver = new CCDIKSolver(h.mesh, [ik])
    const spy = vi.spyOn(solver, 'updateOne')
    solver.update()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(ik)
  })

  it('skips rotation (continue) when target is collinear with the effector', () => {

    const { h, bones, effector, foreArm, arm, target } = setup([-200, 135, 0])
    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: foreArm }, { index: arm }],
      iteration: 3,
    }
    const solver = new CCDIKSolver(h.mesh, [ik])
    const beforeForeArm = bones[foreArm].quaternion.clone()
    const beforeArm = bones[arm].quaternion.clone()

    solver.update()

    expect(bones[foreArm].quaternion.equals(beforeForeArm)).toBe(true)
    expect(bones[arm].quaternion.equals(beforeArm)).toBe(true)
  })

  it('breaks out of the link loop when a link is disabled', () => {
    const { h, bones, effector, foreArm, arm, target } = setup([0, 60, 40])
    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: foreArm, enabled: false }, { index: arm }],
    }
    const solver = new CCDIKSolver(h.mesh, [ik])
    const beforeForeArm = bones[foreArm].quaternion.clone()
    const beforeArm = bones[arm].quaternion.clone()

    solver.update()

    expect(bones[foreArm].quaternion.equals(beforeForeArm)).toBe(true)
    expect(bones[arm].quaternion.equals(beforeArm)).toBe(true)
  })

  it('clamps the step angle to maxAngle', () => {
    const { h, bones, effector, foreArm, arm, target } = setup([0, 60, 40])
    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: foreArm }, { index: arm }],
      maxAngle: 0.01,
    }
    const solver = new CCDIKSolver(h.mesh, [ik])
    const before = bones[foreArm].quaternion.clone()
    solver.update()
    const stepped = bones[foreArm].quaternion.angleTo(before)

    expect(stepped).toBeGreaterThan(0)
    expect(stepped).toBeLessThan(0.05)
  })

  it('raises the step angle to minAngle', () => {
    const { h, bones, effector, foreArm, arm, target } = setup([0, 60, 40])
    const ik: IKConfig = {
      target,
      effector,
      links: [{ index: foreArm }, { index: arm }],

      minAngle: 1.0,
      iteration: 1,
    }
    const solver = new CCDIKSolver(h.mesh, [ik])
    const before = bones[foreArm].quaternion.clone()
    solver.update()
    expect(bones[foreArm].quaternion.angleTo(before)).toBeGreaterThan(0.1)
  })

  it('applies the limitation axis constraint', () => {
    const { h, bones, effector, foreArm, arm, target } = setup([0, 60, 40])
    const ik: IKConfig = {
      target,
      effector,
      links: [
        { index: foreArm, limitation: new THREE.Vector3(0, 1, 0) },
        { index: arm },
      ],
    }
    const solver = new CCDIKSolver(h.mesh, [ik])
    solver.update()

    expect(bones[foreArm].quaternion.x).toBeCloseTo(0, 6)
    expect(bones[foreArm].quaternion.z).toBeCloseTo(0, 6)
  })

  it('clamps euler rotation with rotationMin / rotationMax', () => {
    const { h, bones, effector, foreArm, arm, target } = setup([0, 60, 40])
    const ik: IKConfig = {
      target,
      effector,
      links: [
        {
          index: foreArm,
          rotationMin: new THREE.Vector3(-0.1, -0.1, -0.1),
          rotationMax: new THREE.Vector3(0.1, 0.1, 0.1),
        },
        { index: arm },
      ],
    }
    const solver = new CCDIKSolver(h.mesh, [ik])
    solver.update()
    const e = bones[foreArm].rotation
    expect(e.x).toBeGreaterThanOrEqual(-0.1 - 1e-9)
    expect(e.x).toBeLessThanOrEqual(0.1 + 1e-9)
    expect(e.y).toBeGreaterThanOrEqual(-0.1 - 1e-9)
    expect(e.y).toBeLessThanOrEqual(0.1 + 1e-9)
    expect(e.z).toBeGreaterThanOrEqual(-0.1 - 1e-9)
    expect(e.z).toBeLessThanOrEqual(0.1 + 1e-9)
  })

  it('respects a custom iteration count by converging further', () => {
    const targetW: [number, number, number] = [0, 60, 40]
    const dist = (iteration: number) => {
      const s = setup(targetW)
      const ik: IKConfig = {
        target: s.target,
        effector: s.effector,
        links: [{ index: s.foreArm }, { index: s.arm }],
        iteration,
      }
      new CCDIKSolver(s.h.mesh, [ik]).update()
      return s.effectorWorld().distanceTo(s.targetPos())
    }

    expect(dist(10)).toBeLessThanOrEqual(dist(1) + 1e-6)
  })
})
