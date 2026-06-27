import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenPoseConverter } from '../OpenPoseConverter'
import type { OpenPoseData, OpenPoseResult } from '../OpenPoseConverter'
import { PosingModel } from '../PosingModel'
import type { ModelConfig } from '../types'
import { buildHumanoid } from './fixtures'

const CONFIG: ModelConfig = { boneSize: 1, handBoneSize: 0.5, hipBoneSize: 2, hipBoneName: 'Hips' }

const KEYPOINT_ORDER = [
  'NOSE', 'NECK', 'R_SHOULDER', 'R_ELBOW', 'R_WRIST',
  'L_SHOULDER', 'L_ELBOW', 'L_WRIST', 'MID_HIP', 'R_HIP',
  'R_KNEE', 'R_ANKLE', 'L_HIP', 'L_KNEE', 'L_ANKLE',
  'R_EYE', 'L_EYE', 'R_EAR', 'L_EAR',
]

function flatKeypoints(x: number, y: number, confidence: number): number[] {
  const arr: number[] = []
  for (let i = 0; i < KEYPOINT_ORDER.length; i++) {
    arr.push(x, y, confidence)
  }
  return arr
}

function makePosingModel() {
  const h = buildHumanoid()
  return new PosingModel(h.group, CONFIG)
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OpenPoseConverter construction', () => {
  it('builds a bone map from the skinned mesh skeleton', () => {
    const pm = makePosingModel()
    const converter = new OpenPoseConverter(pm)
    expect(converter).toBeInstanceOf(OpenPoseConverter)

    const bones = (converter as unknown as { bones: Map<string, THREE.Bone> }).bones
    expect(bones.has('mixamorigSpine')).toBe(true)
    expect(bones.size).toBeGreaterThan(0)
  })

  it('throws when the model has no skinned meshes', () => {
    const empty = new PosingModel(new THREE.Group(), CONFIG)
    expect(empty.skinnedMeshes).toHaveLength(0)
    expect(() => new OpenPoseConverter(empty)).toThrow('No skinned meshes found in model')
  })
})

describe('loadFromOpenPoseData', () => {
  let converter: OpenPoseConverter

  beforeEach(() => {
    converter = new OpenPoseConverter(makePosingModel())
  })

  it('parses keypoints, computes confidence and image size', () => {
    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: flatKeypoints(0.5, 0.5, 0.9) }],
      canvas_width: 800,
      canvas_height: 600,
    }
    const result = converter.loadFromOpenPoseData(data)

    expect(result.imageSize).toEqual({ width: 800, height: 600 })
    expect(result.confidence).toBeCloseTo(0.9, 6)

    expect(Object.keys(result.keypoints).length).toBe(KEYPOINT_ORDER.length)
    expect(result.keypoints.NOSE).toBeInstanceOf(THREE.Vector3)
    expect(result.keypoints.NOSE.x).toBeCloseTo(0, 6)
    expect(result.keypoints.NOSE.y).toBeCloseTo(0, 6)
    expect(result.keypoints.NOSE.z).toBe(0)
  })

  it('maps normalized coordinates into the centered 3D space', () => {
    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: flatKeypoints(1, 0, 1) }],
    }
    const result = converter.loadFromOpenPoseData(data)

    expect(result.keypoints.NECK.x).toBeCloseTo(50, 6)
    expect(result.keypoints.NECK.y).toBeCloseTo(50, 6)
  })

  it('defaults image size to 512x512 when canvas dimensions are absent', () => {
    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: flatKeypoints(0.5, 0.5, 1) }],
    }
    const result = converter.loadFromOpenPoseData(data)
    expect(result.imageSize).toEqual({ width: 512, height: 512 })
  })

  it('applies the depth option to the z coordinate', () => {
    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: flatKeypoints(0.5, 0.5, 1) }],
    }
    const result = converter.loadFromOpenPoseData(data, { depth: 7 })
    expect(result.keypoints.NOSE.z).toBe(7)
  })

  it('skips low-confidence keypoints during 3D conversion and yields zero confidence', () => {

    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: flatKeypoints(0.5, 0.5, 0) }],
    }
    const result = converter.loadFromOpenPoseData(data)
    expect(result.confidence).toBe(0)
    expect(Object.keys(result.keypoints).length).toBe(0)
  })

  it('only parses keypoints that fully fit in a short array', () => {

    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: [0.5, 0.5, 0.8, 0.5, 0.5, 0.8] }],
    }
    const result = converter.loadFromOpenPoseData(data)
    expect(Object.keys(result.keypoints).sort()).toEqual(['NECK', 'NOSE'])
  })

  it('throws when there are no people', () => {
    expect(() => converter.loadFromOpenPoseData({ people: [] })).toThrow(
      'No people detected in OpenPose data'
    )
    expect(() =>
      converter.loadFromOpenPoseData({} as unknown as OpenPoseData)
    ).toThrow('No people detected in OpenPose data')
  })

  it('throws when the first person has no 2D keypoints', () => {
    expect(() => converter.loadFromOpenPoseData({ people: [{}] })).toThrow(
      'No 2D keypoints found'
    )
  })
})

describe('loadFromFile', () => {
  let converter: OpenPoseConverter

  beforeEach(() => {
    converter = new OpenPoseConverter(makePosingModel())
  })

  it('reads and parses a JSON file', async () => {
    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: flatKeypoints(0.5, 0.5, 0.7) }],
      canvas_width: 256,
      canvas_height: 256,
    }
    const file = new File([JSON.stringify(data)], 'pose.json', { type: 'application/json' })
    const result = await converter.loadFromFile(file)
    expect(result.imageSize).toEqual({ width: 256, height: 256 })
    expect(result.confidence).toBeCloseTo(0.7, 6)
  })

  it('unwraps a top-level array and uses its first element', async () => {
    const data: OpenPoseData = {
      people: [{ pose_keypoints_2d: flatKeypoints(0.5, 0.5, 0.5) }],
    }
    const file = new File([JSON.stringify([data])], 'pose.json', { type: 'application/json' })
    const result = await converter.loadFromFile(file)
    expect(result.confidence).toBeCloseTo(0.5, 6)
  })

  it('rejects when the file is not valid JSON', async () => {
    const file = new File(['not-json{'], 'bad.json', { type: 'application/json' })
    await expect(converter.loadFromFile(file)).rejects.toThrow(/Failed to parse OpenPose JSON/)
  })

  it('rejects when the parsed JSON has no people', async () => {
    const file = new File([JSON.stringify({ people: [] })], 'empty.json')
    await expect(converter.loadFromFile(file)).rejects.toThrow(/No people detected/)
  })

  it('rejects when the FileReader emits an error', async () => {

    class FailingReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result: string | null = null
      readAsText() {

        setTimeout(() => this.onerror && this.onerror(), 0)
      }
    }
    const original = globalThis.FileReader
    // @ts-expect-error - swapping in a minimal stub for the test
    globalThis.FileReader = FailingReader
    try {
      const file = new File(['{}'], 'x.json')
      await expect(converter.loadFromFile(file)).rejects.toThrow('Failed to read file')
    } finally {
      globalThis.FileReader = original
    }
  })
})

describe('applyToModel', () => {
  it('resets the pose and rotates every targeted bone', () => {
    const pm = makePosingModel()
    const converter = new OpenPoseConverter(pm)
    const resetSpy = vi.spyOn(pm, 'resetPose')

    const result = converter.loadFromOpenPoseData({
      people: [{ pose_keypoints_2d: buildPoseArray() }],
      canvas_width: 512,
      canvas_height: 512,
    })

    converter.applyToModel(result)

    expect(resetSpy).toHaveBeenCalledTimes(1)

    const h = pm.skinnedMeshes[0].skeleton.bones
    const leftArm = h.find((b) => b.name === 'mixamorigLeftArm')!
    const identity = new THREE.Quaternion()
    expect(leftArm.quaternion.equals(identity)).toBe(false)
  })

  it('handles a degenerate (zero-length) bone direction without throwing', () => {

    const h = buildHumanoid()
    h.bones.Spine.position.set(0, 0, 0)
    h.group.updateMatrixWorld(true)
    const pm = new PosingModel(h.group, CONFIG)
    const converter = new OpenPoseConverter(pm)

    const result: OpenPoseResult = {
      keypoints: {
        MID_HIP: new THREE.Vector3(0, 0, 0),
        NECK: new THREE.Vector3(0, 50, 0),
      },
      confidence: 1,
      imageSize: { width: 512, height: 512 },
    }
    expect(() => converter.applyToModel(result)).not.toThrow()
  })

  it('warns and skips when a target bone is missing', () => {
    const pm = makePosingModel()
    const converter = new OpenPoseConverter(pm)

    const bones = (converter as unknown as { bones: Map<string, THREE.Bone> }).bones
    bones.delete('mixamorigNeck')

    const result: OpenPoseResult = {
      keypoints: {
        NECK: new THREE.Vector3(0, 50, 0),
        NOSE: new THREE.Vector3(0, 60, 0),
      },
      confidence: 1,
      imageSize: { width: 512, height: 512 },
    }
    expect(() => converter.applyToModel(result)).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Bone not found: Neck'))
  })

  it('does nothing beyond resetting when no usable keypoints are present', () => {
    const pm = makePosingModel()
    const converter = new OpenPoseConverter(pm)
    const resetSpy = vi.spyOn(pm, 'resetPose')

    const result: OpenPoseResult = {
      keypoints: {},
      confidence: 0,
      imageSize: { width: 512, height: 512 },
    }
    converter.applyToModel(result)
    expect(resetSpy).toHaveBeenCalledTimes(1)
  })

  it('rethrows and logs when pose application fails', () => {
    const pm = makePosingModel()
    const converter = new OpenPoseConverter(pm)
    vi.spyOn(pm, 'resetPose').mockImplementation(() => {
      throw new Error('boom')
    })

    const result: OpenPoseResult = {
      keypoints: {},
      confidence: 0,
      imageSize: { width: 512, height: 512 },
    }
    expect(() => converter.applyToModel(result)).toThrow('boom')
    expect(console.error).toHaveBeenCalled()
  })
})

function buildPoseArray(): number[] {
  const coords: Record<string, [number, number]> = {
    NOSE: [0.5, 0.05],
    NECK: [0.5, 0.2],
    R_SHOULDER: [0.4, 0.2],
    R_ELBOW: [0.35, 0.35],
    R_WRIST: [0.3, 0.5],
    L_SHOULDER: [0.6, 0.2],
    L_ELBOW: [0.65, 0.35],
    L_WRIST: [0.7, 0.5],
    MID_HIP: [0.5, 0.55],
    R_HIP: [0.45, 0.55],
    R_KNEE: [0.45, 0.75],
    R_ANKLE: [0.45, 0.95],
    L_HIP: [0.55, 0.55],
    L_KNEE: [0.55, 0.75],
    L_ANKLE: [0.55, 0.95],
    R_EYE: [0.48, 0.04],
    L_EYE: [0.52, 0.04],
    R_EAR: [0.46, 0.05],
    L_EAR: [0.54, 0.05],
  }
  const arr: number[] = []
  for (const name of KEYPOINT_ORDER) {
    const [x, y] = coords[name]
    arr.push(x, y, 0.9)
  }
  return arr
}
