import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  JSONPoseLoader,
  loadJSONPoseFile,
  loadJSONPoseFromURL,
} from '../JSONPoseLoader'
import { PosingModel } from '../PosingModel'
import type { ModelConfig, PoseData } from '../types'
import { buildHumanoid } from './fixtures'

const CONFIG: ModelConfig = { boneSize: 1, handBoneSize: 0.5, hipBoneSize: 2, hipBoneName: 'Hips' }

function makeModel() {
  return new PosingModel(buildHumanoid().group, CONFIG)
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('applyPoseToModel', () => {
  it('applies a bone rotation by name', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    const loader = new JSONPoseLoader()

    loader.applyPoseToModel(
      { bones: [{ mixamorigSpine: { rotation: { x: 0.5, y: 0, z: 0 } } }] },
      pm
    )

    expect(h.bones['Spine'].rotation.x).toBeCloseTo(0.5)
  })

  it('applies position / quaternion / scale and honours the || defaults', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    const loader = new JSONPoseLoader()

    loader.applyPoseToModel(
      {
        bones: [
          {

            mixamorigSpine: { rotation: { x: 0.25 } as any },
            mixamorigHips: {
              position: { x: 1, y: 2, z: 3 },

              quaternion: { x: 0, y: 0, z: 0 } as any,

              scale: { x: 2, z: 2 } as any,
            },
          },
        ],
      },
      pm
    )

    expect(h.bones['Spine'].rotation.x).toBeCloseTo(0.25)
    expect(h.bones['Spine'].rotation.y).toBeCloseTo(0)
    expect(h.bones['Hips'].position.x).toBeCloseTo(1)
    expect(h.bones['Hips'].quaternion.w).toBeCloseTo(1)
    expect(h.bones['Hips'].scale.x).toBeCloseTo(2)
    expect(h.bones['Hips'].scale.y).toBeCloseTo(1)
  })

  it('normalizes mixamorig1 / underscore bone-name variants', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    const loader = new JSONPoseLoader()

    loader.applyPoseToModel(
      { bones: [{ mixamorig1Spine: { rotation: { x: 0.3, y: 0, z: 0 } } }] },
      pm
    )
    expect(h.bones['Spine'].rotation.x).toBeCloseTo(0.3)

    loader.applyPoseToModel(
      { bones: [{ 'mixamorig_Head': { rotation: { x: 0.4, y: 0, z: 0 } } }] },
      pm
    )
    expect(h.bones['Head'].rotation.x).toBeCloseTo(0.4)
  })

  it('warns when a bone is not found', () => {
    const pm = makeModel()
    const loader = new JSONPoseLoader()
    loader.applyPoseToModel({ bones: [{ NoSuchBone: { rotation: { x: 1, y: 0, z: 0 } } }] }, pm)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Bone not found'))
  })

  it('skips a mesh index that has no bone data', () => {
    const pm = makeModel()
    const loader = new JSONPoseLoader()

    expect(() => loader.applyPoseToModel({ bones: [null as any] }, pm)).not.toThrow()
  })

  it('throws on missing pose data or model', () => {
    const pm = makeModel()
    const loader = new JSONPoseLoader()
    expect(() => loader.applyPoseToModel(null as any, pm)).toThrow('Invalid pose data or posing model')
    expect(() => loader.applyPoseToModel({ bones: [] }, null as any)).toThrow(
      'Invalid pose data or posing model'
    )
  })

  it('throws when the bones array is missing or not an array', () => {
    const pm = makeModel()
    const loader = new JSONPoseLoader()
    expect(() => loader.applyPoseToModel({} as any, pm)).toThrow('missing bones array')
    expect(() => loader.applyPoseToModel({ bones: 'nope' } as any, pm)).toThrow('missing bones array')
  })
})

describe('createPoseDataFromModel', () => {
  it('captures every bone transform of the model', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    h.bones['Spine'].rotation.x = 0.42
    const loader = new JSONPoseLoader()

    const data = loader.createPoseDataFromModel(pm)
    expect(data.bones).toHaveLength(1)
    const spine = data.bones[0]['mixamorigSpine']
    expect(spine.rotation!.x).toBeCloseTo(0.42)
    expect(spine.position).toBeDefined()
    expect(spine.quaternion).toBeDefined()
    expect(spine.scale).toBeDefined()
  })

  it('round-trips through applyPoseToModel', () => {
    const h = buildHumanoid()
    const pm = new PosingModel(h.group, CONFIG)
    h.bones['Spine'].rotation.x = 0.77
    const loader = new JSONPoseLoader()

    const data = loader.createPoseDataFromModel(pm)
    h.bones['Spine'].rotation.x = 0
    loader.applyPoseToModel(data, pm)
    expect(h.bones['Spine'].rotation.x).toBeCloseTo(0.77)
  })
})

describe('validatePoseData', () => {
  const loader = new JSONPoseLoader()

  it('accepts a valid pose', () => {
    expect(() => loader.validatePoseData({ bones: [{}] })).not.toThrow()
  })

  it('rejects missing bones array', () => {
    expect(() => loader.validatePoseData({} as any)).toThrow('missing bones array')
    expect(() => loader.validatePoseData({ bones: {} } as any)).toThrow('missing bones array')
  })

  it('rejects an empty bones array', () => {
    expect(() => loader.validatePoseData({ bones: [] })).toThrow('bones array is empty')
  })
})

describe('loadHandPose', () => {
  it('copies a hand pose onto the same hand', () => {
    const h = buildHumanoid({ includeHands: true })
    const pm = new PosingModel(h.group, CONFIG)
    const loader = new JSONPoseLoader()

    loader.loadHandPose(
      {
        bones: [
          {

            mixamorigLeftHandThumb1: { rotation: { x: 0.7, y: 0, z: 0 } },

            mixamorigLeftHandIndex1: {
              position: { x: 1, y: 1, z: 1 },
              quaternion: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 3, y: 3, z: 3 },
            },
          },
        ],
      },
      pm,
      'left',
      'left'
    )
    expect(h.bones['LeftHandThumb1'].rotation.x).toBeCloseTo(0.7)
    expect(h.bones['LeftHandIndex1'].position.x).toBeCloseTo(1)
    expect(h.bones['LeftHandIndex1'].scale.x).toBeCloseTo(3)
  })

  it('copies a left-hand pose onto the right hand', () => {
    const h = buildHumanoid({ includeHands: true })
    const pm = new PosingModel(h.group, CONFIG)
    const loader = new JSONPoseLoader()

    loader.loadHandPose(
      { bones: [{ mixamorigLeftHandIndex1: { rotation: { x: 0.2, y: 0.5, z: 0.3 } } }] },
      pm,
      'right',
      'left'
    )

    expect(h.bones['RightHandIndex1'].rotation.x).toBeCloseTo(0.2)
    expect(h.bones['RightHandIndex1'].rotation.y).toBeCloseTo(0.5)
    expect(h.bones['RightHandIndex1'].rotation.z).toBeCloseTo(0.3)
  })

  it('ignores source bones that are absent from the data', () => {
    const h = buildHumanoid({ includeHands: true })
    const pm = new PosingModel(h.group, CONFIG)
    const loader = new JSONPoseLoader()

    expect(() =>
      loader.loadHandPose({ bones: [{ mixamorigSpine: { rotation: { x: 1, y: 0, z: 0 } } }] }, pm, 'left', 'left')
    ).not.toThrow()
    expect(h.bones['LeftHandThumb1'].rotation.x).toBeCloseTo(0)
  })

  it('warns when the target bone is missing', () => {

    const h = buildHumanoid({ includeHands: false })
    const pm = new PosingModel(h.group, CONFIG)
    const loader = new JSONPoseLoader()
    loader.loadHandPose(
      { bones: [{ mixamorigLeftHandThumb1: { rotation: { x: 0.5, y: 0, z: 0 } } }] },
      pm,
      'left',
      'left'
    )
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Target bone not found'))
  })

  it('skips a mesh index with no data', () => {
    const pm = makeModel()
    const loader = new JSONPoseLoader()
    expect(() => loader.loadHandPose({ bones: [null as any] }, pm, 'left', 'left')).not.toThrow()
  })

  it('throws on invalid data or model', () => {
    const pm = makeModel()
    const loader = new JSONPoseLoader()
    expect(() => loader.loadHandPose(null as any, pm, 'left', 'left')).toThrow(
      'Invalid pose data or posing model'
    )
    expect(() => loader.loadHandPose({ bones: [{}] }, null as any, 'left', 'left')).toThrow(
      'Invalid pose data or posing model'
    )
    expect(() => loader.loadHandPose({} as any, pm, 'left', 'left')).toThrow('missing bones array')
  })
})

describe('saveToJSONFile', () => {
  it('builds a blob URL and triggers a download', () => {
    const loader = new JSONPoseLoader()
    const createSpy = vi.fn(() => 'blob:fake')
    const revokeSpy = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createSpy, revokeObjectURL: revokeSpy })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    loader.saveToJSONFile({ bones: [{}] }, 'my.pose.json')

    expect(createSpy).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake')
  })

  it('defaults the filename', () => {
    const loader = new JSONPoseLoader()
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
    let downloaded = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download
    })
    loader.saveToJSONFile({ bones: [{}] })
    expect(downloaded).toBe('pose.pose.json')
  })
})

describe('loadFromFile', () => {
  const validPose: PoseData = { bones: [{ mixamorigSpine: { rotation: { x: 0.1, y: 0, z: 0 } } }] }

  it('parses a valid .json file', async () => {
    const file = new File([JSON.stringify(validPose)], 'p.json', { type: 'application/json' })
    const data = await new JSONPoseLoader().loadFromFile(file)
    expect(data.bones[0]['mixamorigSpine'].rotation!.x).toBeCloseTo(0.1)
  })

  it('accepts the .pose.json extension', async () => {
    const file = new File([JSON.stringify(validPose)], 'p.pose.json', { type: 'application/json' })
    const data = await new JSONPoseLoader().loadFromFile(file)
    expect(data.bones).toHaveLength(1)
  })

  it('rejects when no file is provided', async () => {
    await expect(new JSONPoseLoader().loadFromFile(undefined as any)).rejects.toThrow(
      'No file provided'
    )
  })

  it('rejects an unsupported file type', async () => {
    const file = new File(['{}'], 'p.txt', { type: 'text/plain' })
    await expect(new JSONPoseLoader().loadFromFile(file)).rejects.toThrow('Invalid file type')
  })

  it('rejects malformed JSON', async () => {
    const file = new File(['{ not valid json'], 'bad.json', { type: 'application/json' })
    await expect(new JSONPoseLoader().loadFromFile(file)).rejects.toThrow('Failed to parse pose file')
  })

  it('rejects valid JSON that fails pose validation', async () => {
    const file = new File([JSON.stringify({ bones: [] })], 'empty.json', { type: 'application/json' })
    await expect(new JSONPoseLoader().loadFromFile(file)).rejects.toThrow('Failed to parse pose file')
  })

  it('rejects when the reader errors', async () => {

    const realRAT = FileReader.prototype.readAsText
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent('error') as any)
    })
    const file = new File(['{}'], 'p.json', { type: 'application/json' })
    await expect(new JSONPoseLoader().loadFromFile(file)).rejects.toThrow('Failed to read file')
    expect(realRAT).toBeTypeOf('function')
  })
})

describe('loadFromURL', () => {
  function stubXHR(behavior: (xhr: any) => void) {
    class MockXHR {
      status = 0
      response = ''
      responseType = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onprogress: ((e: any) => void) | null = null
      open = vi.fn()
      send = vi.fn(() => {
        if (this.onprogress) this.onprogress({ lengthComputable: true, loaded: 5, total: 10 })
        behavior(this)
      })
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR as any)
  }

  const validPose: PoseData = { bones: [{ mixamorigHips: { rotation: { x: 0.9, y: 0, z: 0 } } }] }

  it('resolves on a 200 response and reports progress', async () => {
    stubXHR((xhr) => {
      xhr.status = 200
      xhr.response = JSON.stringify(validPose)
      xhr.onload!()
    })
    const onProgress = vi.fn()
    const data = await new JSONPoseLoader().loadFromURL('http://x/pose.json', onProgress)
    expect(data.bones[0]['mixamorigHips'].rotation!.x).toBeCloseTo(0.9)
    expect(onProgress).toHaveBeenCalledWith(50)
  })

  it('works without a progress callback', async () => {
    stubXHR((xhr) => {
      xhr.status = 200
      xhr.response = JSON.stringify(validPose)
      xhr.onload!()
    })
    const data = await new JSONPoseLoader().loadFromURL('http://x/pose.json')
    expect(data.bones).toHaveLength(1)
  })

  it('rejects when the JSON is malformed', async () => {
    stubXHR((xhr) => {
      xhr.status = 200
      xhr.response = 'not-json'
      xhr.onload!()
    })
    await expect(new JSONPoseLoader().loadFromURL('http://x/bad.json')).rejects.toThrow(
      'Failed to parse JSON file'
    )
  })

  it('rejects on a non-200 status', async () => {
    stubXHR((xhr) => {
      xhr.status = 404
      xhr.onload!()
    })
    await expect(new JSONPoseLoader().loadFromURL('http://x/missing.json')).rejects.toThrow('HTTP 404')
  })

  it('rejects on a network error', async () => {
    stubXHR((xhr) => {
      xhr.onerror!()
    })
    await expect(new JSONPoseLoader().loadFromURL('http://x/err.json')).rejects.toThrow('Network error')
  })

  it('does not report progress when not lengthComputable', async () => {
    class MockXHR {
      status = 0
      response = ''
      responseType = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onprogress: ((e: any) => void) | null = null
      open = vi.fn()
      send = vi.fn(() => {
        this.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 })
        this.status = 200
        this.response = JSON.stringify(validPose)
        this.onload!()
      })
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR as any)
    const onProgress = vi.fn()
    await new JSONPoseLoader().loadFromURL('http://x/pose.json', onProgress)
    expect(onProgress).not.toHaveBeenCalled()
  })
})

describe('module-level helpers', () => {
  it('loadJSONPoseFile delegates to loadFromFile', async () => {
    const file = new File([JSON.stringify({ bones: [{}] })], 'p.json', { type: 'application/json' })
    const data = await loadJSONPoseFile(file)
    expect(data.bones).toHaveLength(1)
  })

  it('loadJSONPoseFromURL delegates to loadFromURL', async () => {
    class MockXHR {
      status = 200
      response = JSON.stringify({ bones: [{}] })
      responseType = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onprogress: ((e: any) => void) | null = null
      open = vi.fn()
      send = vi.fn(() => this.onload!())
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR as any)
    const data = await loadJSONPoseFromURL('http://x/pose.json')
    expect(data.bones).toHaveLength(1)
  })
})
