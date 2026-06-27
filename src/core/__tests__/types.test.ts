import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { isFKController, isIKController, isRootController } from '../types'

describe('controller type guards', () => {
  const make = (name: string): THREE.Object3D => {
    const o = new THREE.Mesh()
    o.name = name
    return o
  }

  it('isFKController matches only "BoneController"', () => {
    expect(isFKController(make('BoneController'))).toBe(true)
    expect(isFKController(make('BoneControllerIK'))).toBe(false)
    expect(isFKController(make('ModelRootController'))).toBe(false)
    expect(isFKController(make('other'))).toBe(false)
  })

  it('isIKController matches only "BoneControllerIK"', () => {
    expect(isIKController(make('BoneControllerIK'))).toBe(true)
    expect(isIKController(make('BoneController'))).toBe(false)
    expect(isIKController(make('ModelRootController'))).toBe(false)
    expect(isIKController(make('other'))).toBe(false)
  })

  it('isRootController matches only "ModelRootController"', () => {
    expect(isRootController(make('ModelRootController'))).toBe(true)
    expect(isRootController(make('BoneController'))).toBe(false)
    expect(isRootController(make('BoneControllerIK'))).toBe(false)
    expect(isRootController(make('other'))).toBe(false)
  })
})
