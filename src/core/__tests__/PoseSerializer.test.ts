import * as THREE from 'three'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { PoseSerializer, PoseLibrary } from '../PoseSerializer'
import type { SerializedPose, SerializedLibrary } from '../PoseSerializer'
import { PosingModel } from '../PosingModel'
import type { ModelConfig } from '../types'
import { buildHumanoid } from './fixtures'

const CONFIG: ModelConfig = { boneSize: 1, handBoneSize: 0.5, hipBoneSize: 2, hipBoneName: 'Hips' }

function makeModel(): PosingModel {
  return new PosingModel(buildHumanoid().group, CONFIG)
}

function createMemStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v))
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  } as Storage
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('localStorage', createMemStorage())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PoseSerializer.serializePose', () => {
  it('serializes a valid posing model with default metadata', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()

    const data = serializer.serializePose(pm)

    expect(data.version).toBe('1.0.0')
    expect(typeof data.timestamp).toBe('string')
    expect(data.metadata.name).toBe('Untitled Pose')
    expect(data.metadata.description).toBe('')
    expect(data.metadata.tags).toEqual([])
    expect(data.metadata.author).toBe('')
    expect(data.camera).toBeNull()
    expect(data.model.name).toBeTruthy()
    expect(data.bones.length).toBe(1)

    const boneNames = Object.keys(data.bones[0].boneData)
    expect(boneNames.length).toBeGreaterThan(0)
    const first = data.bones[0].boneData[boneNames[0]]
    expect(first.position).toHaveProperty('x')
    expect(first.rotation).toHaveProperty('order')
    expect(first.quaternion).toHaveProperty('w')
    expect(first.scale).toHaveProperty('z')
  })

  it('honours supplied metadata fields', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()

    const data = serializer.serializePose(pm, {
      name: 'My Pose',
      description: 'a desc',
      tags: ['a', 'b'],
      author: 'terry',
    })

    expect(data.metadata.name).toBe('My Pose')
    expect(data.metadata.description).toBe('a desc')
    expect(data.metadata.tags).toEqual(['a', 'b'])
    expect(data.metadata.author).toBe('terry')
  })

  it('serializes camera state when a camera is provided', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(1, 2, 3)
    camera.zoom = 2

    const data = serializer.serializePose(pm, { camera })

    expect(data.camera).not.toBeNull()
    expect(data.camera!.fov).toBe(50)
    expect(data.camera!.zoom).toBe(2)
    expect(data.camera!.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(data.camera!.rotation).toHaveProperty('order')
  })

  it('throws on a null model', () => {
    const serializer = new PoseSerializer()
    expect(() => serializer.serializePose(null as unknown as PosingModel)).toThrow('Invalid posing model')
  })

  it('throws when the model has no skinned meshes', () => {
    const serializer = new PoseSerializer()
    const fake = { skinnedMeshes: [] } as unknown as PosingModel
    expect(() => serializer.serializePose(fake)).toThrow('Invalid posing model')
  })
})

describe('PoseSerializer.deserializePose', () => {
  it('round-trips a pose: serialize -> mutate -> deserialize restores transforms', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const bone = pm.skinnedMeshes[0].skeleton.bones[0]

    bone.rotation.set(0.1, 0.2, 0.3)
    bone.updateMatrix()
    const data = serializer.serializePose(pm)
    const savedQuat = bone.quaternion.clone()

    bone.rotation.set(1, 1, 1)
    bone.quaternion.setFromEuler(bone.rotation)

    serializer.deserializePose(data, pm)

    expect(bone.quaternion.x).toBeCloseTo(savedQuat.x, 5)
    expect(bone.quaternion.y).toBeCloseTo(savedQuat.y, 5)
    expect(bone.quaternion.z).toBeCloseTo(savedQuat.z, 5)
    expect(bone.quaternion.w).toBeCloseTo(savedQuat.w, 5)
  })

  it('returns the stored metadata', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm, { name: 'kept' })

    const meta = serializer.deserializePose(data, pm)
    expect(meta.name).toBe('kept')
  })

  it('applies the model transform by default', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm)
    data.model.position = { x: 7, y: 8, z: 9 }

    serializer.deserializePose(data, pm)
    expect(pm.mesh.position.x).toBe(7)
    expect(pm.mesh.position.y).toBe(8)
    expect(pm.mesh.position.z).toBe(9)
  })

  it('skips the model transform when skipModelTransform is set', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    pm.mesh.position.set(0, 0, 0)
    const data = serializer.serializePose(pm)
    data.model.position = { x: 7, y: 8, z: 9 }

    serializer.deserializePose(data, pm, { skipModelTransform: true })
    expect(pm.mesh.position.x).toBe(0)
  })

  it('warns on a version mismatch', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm)
    data.version = '0.0.1'

    serializer.deserializePose(data, pm)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('version mismatch'))
  })

  it('warns when a mesh index is out of range', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm)

    data.bones.push({ ...data.bones[0], meshIndex: 1 })

    serializer.deserializePose(data, pm)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not found in model'))
  })

  it('warns when a bone name is missing from the model', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm)
    data.bones[0].boneData['NonexistentBone'] = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    }

    serializer.deserializePose(data, pm)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Bone NonexistentBone not found'))
  })

  it('tolerates a pose with an empty bones array', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm)
    data.bones = []
    expect(() => serializer.deserializePose(data, pm)).not.toThrow()
  })

  it('throws when pose data or model is missing', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    expect(() => serializer.deserializePose(null as unknown as SerializedPose, pm)).toThrow(
      'Invalid pose data or posing model'
    )
    const data = serializer.serializePose(pm)
    expect(() => serializer.deserializePose(data, null as unknown as PosingModel)).toThrow(
      'Invalid pose data or posing model'
    )
  })
})

describe('PoseSerializer.savePoseToFile', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('builds a download with an explicit filename', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm)

    serializer.savePoseToFile(data, 'custom.pose.json')

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('derives a filename from the pose name when none is given', () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm, { name: 'Hello World!' })

    expect(() => serializer.savePoseToFile(data)).not.toThrow()
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})

describe('PoseSerializer.loadPoseFromFile', () => {
  function makeFile(content: string, name = 'pose.json'): File {
    return new File([content], name, { type: 'application/json' })
  }

  it('loads and validates a well-formed pose file', async () => {
    const serializer = new PoseSerializer()
    const pm = makeModel()
    const data = serializer.serializePose(pm, { name: 'fromfile' })
    const file = makeFile(JSON.stringify(data), 'x.pose.json')

    const loaded = await serializer.loadPoseFromFile(file)
    expect(loaded.metadata.name).toBe('fromfile')
    expect(loaded.version).toBe('1.0.0')
  })

  it('rejects when no file is provided', async () => {
    const serializer = new PoseSerializer()
    await expect(serializer.loadPoseFromFile(null as unknown as File)).rejects.toThrow('No file provided')
  })

  it('rejects a wrong file extension', async () => {
    const serializer = new PoseSerializer()
    const file = makeFile('{}', 'pose.txt')
    await expect(serializer.loadPoseFromFile(file)).rejects.toThrow('Invalid file type')
  })

  it('rejects invalid JSON', async () => {
    const serializer = new PoseSerializer()
    const file = makeFile('not-json{', 'bad.json')
    await expect(serializer.loadPoseFromFile(file)).rejects.toThrow('Failed to parse pose file')
  })

  it('rejects a file missing the version field', async () => {
    const serializer = new PoseSerializer()
    const file = makeFile(JSON.stringify({ bones: [], metadata: {} }), 'x.json')
    await expect(serializer.loadPoseFromFile(file)).rejects.toThrow('Missing version field')
  })

  it('rejects a file with missing/invalid bones', async () => {
    const serializer = new PoseSerializer()
    const file = makeFile(JSON.stringify({ version: '1.0.0', metadata: {} }), 'x.json')
    await expect(serializer.loadPoseFromFile(file)).rejects.toThrow('Missing or invalid bones data')
  })

  it('rejects a file missing metadata', async () => {
    const serializer = new PoseSerializer()
    const file = makeFile(JSON.stringify({ version: '1.0.0', bones: [] }), 'x.json')
    await expect(serializer.loadPoseFromFile(file)).rejects.toThrow('Missing metadata')
  })
})

describe('PoseSerializer.createThumbnail', () => {
  it('scales the source canvas into a JPEG data URL', () => {

    const drawImage = vi.fn()
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,stub')

    const serializer = new PoseSerializer()
    const source = document.createElement('canvas')
    source.width = 100
    source.height = 100

    const result = serializer.createThumbnail(source, { width: 64, height: 64 })

    expect(result).toBe('data:image/jpeg;base64,stub')
    expect(drawImage).toHaveBeenCalledOnce()
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8)

    getContext.mockRestore()
    toDataURL.mockRestore()
  })
})

function makePoseData(serializer: PoseSerializer, name: string, opts: { description?: string; tags?: string[] } = {}): SerializedPose {
  const pm = makeModel()
  return serializer.serializePose(pm, { name, description: opts.description, tags: opts.tags })
}

describe('PoseLibrary CRUD', () => {
  let serializer: PoseSerializer

  beforeEach(() => {
    localStorage.clear()
    serializer = new PoseSerializer()
  })

  it('starts empty', () => {
    const lib = new PoseLibrary()
    expect(lib.getAllPoses()).toEqual([])
  })

  it('adds a pose and retrieves it by id', () => {
    const lib = new PoseLibrary()
    const id = lib.addPose(makePoseData(serializer, 'p1'), 'thumb-data')

    expect(typeof id).toBe('string')
    const pose = lib.getPose(id)
    expect(pose).toBeDefined()
    expect(pose!.thumbnail).toBe('thumb-data')
    expect(pose!.poseData.metadata.name).toBe('p1')
    expect(lib.getAllPoses()).toHaveLength(1)
  })

  it('returns undefined for an unknown id', () => {
    const lib = new PoseLibrary()
    expect(lib.getPose('missing')).toBeUndefined()
  })

  it('deletes an existing pose and reports success', () => {
    const lib = new PoseLibrary()
    const id = lib.addPose(makePoseData(serializer, 'p1'))
    expect(lib.deletePose(id)).toBe(true)
    expect(lib.getAllPoses()).toHaveLength(0)
  })

  it('returns false when deleting an unknown pose', () => {
    const lib = new PoseLibrary()
    expect(lib.deletePose('missing')).toBe(false)
  })

  it('updates an existing pose (with thumbnail)', () => {
    const lib = new PoseLibrary()
    const id = lib.addPose(makePoseData(serializer, 'old'))
    const ok = lib.updatePose(id, makePoseData(serializer, 'new'), 'new-thumb')

    expect(ok).toBe(true)
    const pose = lib.getPose(id)!
    expect(pose.poseData.metadata.name).toBe('new')
    expect(pose.thumbnail).toBe('new-thumb')
    expect(pose.updatedAt).toBeTruthy()
  })

  it('updates an existing pose keeping the old thumbnail when none supplied', () => {
    const lib = new PoseLibrary()
    const id = lib.addPose(makePoseData(serializer, 'old'), 'orig-thumb')
    lib.updatePose(id, makePoseData(serializer, 'new'))

    expect(lib.getPose(id)!.thumbnail).toBe('orig-thumb')
  })

  it('returns false when updating an unknown pose', () => {
    const lib = new PoseLibrary()
    expect(lib.updatePose('missing', makePoseData(serializer, 'x'))).toBe(false)
  })
})

describe('PoseLibrary.searchPoses', () => {
  let serializer: PoseSerializer
  let lib: PoseLibrary

  beforeEach(() => {
    localStorage.clear()
    serializer = new PoseSerializer()
    lib = new PoseLibrary()
    lib.addPose(makePoseData(serializer, 'Walking', { description: 'a stroll', tags: ['locomotion'] }))
    lib.addPose(makePoseData(serializer, 'Jumping', { description: 'in the air', tags: ['action', 'sport'] }))
  })

  it('matches by name (case-insensitive)', () => {
    expect(lib.searchPoses('walk')).toHaveLength(1)
    expect(lib.searchPoses('WALK')).toHaveLength(1)
  })

  it('matches by description', () => {
    expect(lib.searchPoses('air')).toHaveLength(1)
  })

  it('matches by tag', () => {
    expect(lib.searchPoses('sport')).toHaveLength(1)
  })

  it('returns nothing when nothing matches', () => {
    expect(lib.searchPoses('zzz-nope')).toHaveLength(0)
  })
})

describe('PoseLibrary localStorage persistence', () => {
  let serializer: PoseSerializer

  beforeEach(() => {
    localStorage.clear()
    serializer = new PoseSerializer()
  })

  it('persists across instances (save -> load round-trip)', () => {
    const lib1 = new PoseLibrary()
    lib1.addPose(makePoseData(serializer, 'persisted'))

    const lib2 = new PoseLibrary()
    expect(lib2.getAllPoses()).toHaveLength(1)
    expect(lib2.getAllPoses()[0].poseData.metadata.name).toBe('persisted')
  })

  it('clearLibrary empties storage', () => {
    const lib = new PoseLibrary()
    lib.addPose(makePoseData(serializer, 'p'))
    lib.clearLibrary()
    expect(lib.getAllPoses()).toHaveLength(0)

    const fresh = new PoseLibrary()
    expect(fresh.getAllPoses()).toHaveLength(0)
  })

  it('recovers from corrupt storage by resetting to empty', () => {
    localStorage.setItem('pose-three_pose_library', 'not-valid-json{')
    const lib = new PoseLibrary()
    expect(lib.getAllPoses()).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })

  it('logs an error when saving fails', () => {
    const lib = new PoseLibrary()

    vi.stubGlobal('localStorage', {
      ...createMemStorage(),
      setItem: () => {
        throw new Error('quota')
      },
    })
    lib.saveToLocalStorage()
    expect(console.error).toHaveBeenCalledWith('Failed to save pose library:', expect.any(Error))
  })
})

describe('PoseLibrary.exportLibrary', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('triggers a download with the default filename', () => {
    const serializer = new PoseSerializer()
    const lib = new PoseLibrary()
    lib.addPose(makePoseData(serializer, 'p'))

    lib.exportLibrary()

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('accepts a custom filename', () => {
    const lib = new PoseLibrary()
    expect(() => lib.exportLibrary('my_lib.json')).not.toThrow()
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})

describe('PoseLibrary.importLibrary', () => {
  let serializer: PoseSerializer

  beforeEach(() => {
    localStorage.clear()
    serializer = new PoseSerializer()
  })

  function libFile(lib: SerializedLibrary, name = 'lib.json'): File {
    return new File([JSON.stringify(lib)], name, { type: 'application/json' })
  }

  function storedPose(name: string) {
    return {
      id: 'fixed-id',
      poseData: makePoseData(serializer, name),
      thumbnail: null,
      addedAt: new Date().toISOString(),
    }
  }

  it('merges imported poses with existing ones and regenerates ids', async () => {
    const lib = new PoseLibrary()
    const existingId = lib.addPose(makePoseData(serializer, 'existing'))

    const payload: SerializedLibrary = { poses: [storedPose('imported')] }
    const count = await lib.importLibrary(libFile(payload), 'merge')

    expect(count).toBe(1)
    expect(lib.getAllPoses()).toHaveLength(2)

    expect(lib.getPose(existingId)).toBeDefined()

    expect(lib.getPose('fixed-id')).toBeUndefined()
    const imported = lib.getAllPoses().find((p) => p.poseData.metadata.name === 'imported')
    expect(imported).toBeDefined()
  })

  it('defaults to merge mode', async () => {
    const lib = new PoseLibrary()
    lib.addPose(makePoseData(serializer, 'existing'))
    const payload: SerializedLibrary = { poses: [storedPose('imported')] }

    await lib.importLibrary(libFile(payload))
    expect(lib.getAllPoses()).toHaveLength(2)
  })

  it('replaces the library in replace mode', async () => {
    const lib = new PoseLibrary()
    lib.addPose(makePoseData(serializer, 'existing'))

    const payload: SerializedLibrary = { poses: [storedPose('only')] }
    const count = await lib.importLibrary(libFile(payload), 'replace')

    expect(count).toBe(1)
    expect(lib.getAllPoses()).toHaveLength(1)
    expect(lib.getAllPoses()[0].poseData.metadata.name).toBe('only')
  })

  it('rejects a library file without a poses array', async () => {
    const lib = new PoseLibrary()
    const file = new File([JSON.stringify({ version: '1.0.0' })], 'lib.json', { type: 'application/json' })
    await expect(lib.importLibrary(file)).rejects.toThrow('Invalid library file')
  })

  it('rejects an unparseable library file', async () => {
    const lib = new PoseLibrary()
    const file = new File(['not-json{'], 'lib.json', { type: 'application/json' })
    await expect(lib.importLibrary(file)).rejects.toThrow('Failed to import library')
  })

  it('persists imported poses to storage', async () => {
    const lib = new PoseLibrary()
    const payload: SerializedLibrary = { poses: [storedPose('persist-import')] }
    await lib.importLibrary(payload && libFile(payload), 'replace')

    const reopened = new PoseLibrary()
    expect(reopened.getAllPoses()).toHaveLength(1)
    expect(reopened.getAllPoses()[0].poseData.metadata.name).toBe('persist-import')
  })
})
