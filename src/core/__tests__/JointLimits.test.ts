import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  JOINT_LIMITS,
  clampRotation,
  applyJointLimits,
  hasJointLimits,
} from '../JointLimits'

const deg2rad = (deg: number) => (deg * Math.PI) / 180

describe('JOINT_LIMITS table', () => {
  it('contains the core humanoid joints', () => {
    expect(JOINT_LIMITS.Spine).toBeDefined()
    expect(JOINT_LIMITS.LeftForeArm).toBeDefined()
    expect(JOINT_LIMITS.RightForeArm).toBeDefined()
  })

  it('mirrors left finger limits onto the right hand', () => {

    expect(JOINT_LIMITS.RightHandThumb1).toEqual(JOINT_LIMITS.LeftHandThumb1)
    expect(JOINT_LIMITS.RightHandIndex3).toEqual(JOINT_LIMITS.LeftHandIndex3)

    expect(JOINT_LIMITS.RightHandThumb1).not.toBe(JOINT_LIMITS.LeftHandThumb1)
  })
})

describe('clampRotation', () => {
  it('returns min when value is below min', () => {
    expect(clampRotation(-5, -1, 1)).toBe(-1)
  })

  it('returns max when value is above max', () => {
    expect(clampRotation(5, -1, 1)).toBe(1)
  })

  it('returns the value unchanged when within range', () => {
    expect(clampRotation(0.5, -1, 1)).toBe(0.5)
  })

  it('ignores the lower bound when min is null', () => {

    expect(clampRotation(-100, null, 10)).toBe(-100)

    expect(clampRotation(50, null, 10)).toBe(10)
  })

  it('ignores the upper bound when max is null', () => {

    expect(clampRotation(100, -10, null)).toBe(100)

    expect(clampRotation(-50, -10, null)).toBe(-10)
  })

  it('returns the value unchanged when both bounds are null', () => {
    expect(clampRotation(999, null, null)).toBe(999)
  })
})

describe('hasJointLimits', () => {
  it('is true for a known suffix with the mixamorig prefix', () => {
    expect(hasJointLimits('mixamorigSpine')).toBe(true)
    expect(hasJointLimits('mixamorigLeftForeArm')).toBe(true)
  })

  it('is true for an exact key name (no prefix)', () => {
    expect(hasJointLimits('Head')).toBe(true)
  })

  it('is false for an unknown bone name', () => {
    expect(hasJointLimits('mixamorigHips')).toBe(false)
    expect(hasJointLimits('SomethingElse')).toBe(false)
  })
})

describe('applyJointLimits', () => {
  it('clamps every axis for a fully-bounded joint', () => {

    const euler = new THREE.Euler(Math.PI, -Math.PI, 0)
    applyJointLimits('mixamorigSpine', euler)
    expect(euler.x).toBeCloseTo(deg2rad(45), 6)
    expect(euler.y).toBeCloseTo(deg2rad(-25), 6)
    expect(euler.z).toBe(0)
  })

  it('leaves null-bounded axes free while clamping bounded ones', () => {

    const euler = new THREE.Euler(123, -1, Math.PI)
    applyJointLimits('mixamorigLeftForeArm', euler)
    expect(euler.x).toBe(123)
    expect(euler.y).toBeCloseTo(deg2rad(0), 6)
    expect(euler.z).toBeCloseTo(deg2rad(90), 6)
  })

  it('does not match LeftArm limits for a LeftForeArm bone (endsWith specificity)', () => {

    const euler = new THREE.Euler(123, 0.1, 0)
    applyJointLimits('mixamorigLeftForeArm', euler)
    expect(euler.x).toBe(123)
  })

  it('does nothing for an unknown bone name', () => {
    const euler = new THREE.Euler(Math.PI, Math.PI, Math.PI)
    applyJointLimits('mixamorigHips', euler)
    expect(euler.x).toBe(Math.PI)
    expect(euler.y).toBe(Math.PI)
    expect(euler.z).toBe(Math.PI)
  })
})
