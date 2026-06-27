import * as THREE from 'three'
import type { PosingModel } from './PosingModel'
import type { Vec3Like, Vec4Like } from './types'

export interface SerializedEuler {
  x: number
  y: number
  z: number
  order: THREE.EulerOrder
}

export interface SerializedBoneTransform {
  position: Vec3Like
  rotation: SerializedEuler
  quaternion: Vec4Like
  scale: Vec3Like
}

export interface SerializedBoneGroup {
  meshIndex: number
  meshName: string
  boneData: Record<string, SerializedBoneTransform>
}

export interface SerializedModel {
  name: string
  position: Vec3Like
  rotation: SerializedEuler
  scale: Vec3Like
}

export interface SerializedCamera {
  position: Vec3Like
  rotation: SerializedEuler
  fov: number
  zoom: number
}

export interface SerializeMetadataInput {
  name?: string
  description?: string
  tags?: string[]
  author?: string
  camera?: THREE.PerspectiveCamera
}

export interface SerializedMetadata {
  name: string
  description: string
  tags: string[]
  author: string
  camera?: THREE.PerspectiveCamera
}

export interface SerializedPose {
  version: string
  timestamp: string
  metadata: SerializedMetadata
  camera: SerializedCamera | null
  model: SerializedModel
  bones: SerializedBoneGroup[]
}

export interface DeserializeOptions {
  skipModelTransform?: boolean
}

export interface ThumbnailSize {
  width: number
  height: number
}

export class PoseSerializer {
  version: string

  constructor() {
    this.version = '1.0.0'
  }

  serializePose(posingModel: PosingModel, metadata: SerializeMetadataInput = {}): SerializedPose {
    if (!posingModel || !posingModel.skinnedMeshes.length) {
      throw new Error('Invalid posing model')
    }

    const poseData: SerializedPose = {
      version: this.version,
      timestamp: new Date().toISOString(),
      metadata: {
        name: metadata.name || 'Untitled Pose',
        description: metadata.description || '',
        tags: metadata.tags || [],
        author: metadata.author || '',
        ...metadata
      },
      camera: this._serializeCamera(metadata.camera),
      model: {
        name: posingModel.mesh.name || 'Model',
        position: this._serializeVector3(posingModel.mesh.position),
        rotation: this._serializeEuler(posingModel.mesh.rotation),
        scale: this._serializeVector3(posingModel.mesh.scale)
      },
      bones: []
    }

    posingModel.skinnedMeshes.forEach((skinnedMesh, meshIndex) => {
      const bones = skinnedMesh.skeleton.bones
      const boneData: Record<string, SerializedBoneTransform> = {}

      bones.forEach((bone) => {
        boneData[bone.name] = {
          position: this._serializeVector3(bone.position),
          rotation: this._serializeEuler(bone.rotation),
          quaternion: this._serializeQuaternion(bone.quaternion),
          scale: this._serializeVector3(bone.scale)
        }
      })

      poseData.bones.push({
        meshIndex: meshIndex,
        meshName: skinnedMesh.name || `Mesh_${meshIndex}`,
        boneData: boneData
      })
    })

    return poseData
  }

  deserializePose(
    poseData: SerializedPose,
    posingModel: PosingModel,
    options: DeserializeOptions = {}
  ): SerializedMetadata {
    if (!poseData || !posingModel) {
      throw new Error('Invalid pose data or posing model')
    }

    if (poseData.version !== this.version) {
      console.warn(`Pose version mismatch: ${poseData.version} vs ${this.version}`)
    }

    if (!options.skipModelTransform && poseData.model) {
      this._applyVector3(posingModel.mesh.position, poseData.model.position)
      this._applyEuler(posingModel.mesh.rotation, poseData.model.rotation)
      this._applyVector3(posingModel.mesh.scale, poseData.model.scale)
    }

    if (poseData.bones && poseData.bones.length > 0) {
      poseData.bones.forEach((meshData, meshIndex) => {
        if (meshIndex >= posingModel.skinnedMeshes.length) {
          console.warn(`Mesh index ${meshIndex} not found in model`)
          return
        }

        const skinnedMesh = posingModel.skinnedMeshes[meshIndex]
        const bones = skinnedMesh.skeleton.bones

        Object.keys(meshData.boneData).forEach((boneName) => {
          const boneTransform = meshData.boneData[boneName]
          const bone = bones.find((b) => b.name === boneName)

          if (!bone) {
            console.warn(`Bone ${boneName} not found in model`)
            return
          }

          if (boneTransform.position) {
            this._applyVector3(bone.position, boneTransform.position)
          }
          if (boneTransform.rotation) {
            this._applyEuler(bone.rotation, boneTransform.rotation)
          }
          if (boneTransform.quaternion) {
            this._applyQuaternion(bone.quaternion, boneTransform.quaternion)
          }
          if (boneTransform.scale) {
            this._applyVector3(bone.scale, boneTransform.scale)
          }

          bone.updateMatrix()
          bone.updateMatrixWorld(true)
        })
      })
    }

    return poseData.metadata
  }

  savePoseToFile(poseData: SerializedPose, filename: string | null = null): void {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const poseName = poseData.metadata?.name?.replace(/[^a-z0-9]/gi, '_') || 'pose'
      filename = `${poseName}_${timestamp}.pose.json`
    }

    const json = JSON.stringify(poseData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
  }

  async loadPoseFromFile(file: File): Promise<SerializedPose> {
    return new Promise<SerializedPose>((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'))
        return
      }

      if (!file.name.endsWith('.json') && !file.name.endsWith('.pose.json')) {
        reject(new Error('Invalid file type. Expected .json or .pose.json'))
        return
      }

      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const poseData: unknown = JSON.parse(e.target?.result as string)
          this._validatePoseData(poseData)
          resolve(poseData)
        } catch (error) {
          reject(new Error(`Failed to parse pose file: ${error instanceof Error ? error.message : String(error)}`))
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsText(file)
    })
  }

  private _validatePoseData(poseData: unknown): asserts poseData is SerializedPose {
    const data = poseData as SerializedPose
    if (!data.version) {
      throw new Error('Missing version field')
    }
    if (!data.bones || !Array.isArray(data.bones)) {
      throw new Error('Missing or invalid bones data')
    }
    if (!data.metadata) {
      throw new Error('Missing metadata')
    }
  }

  private _serializeVector3(vector: THREE.Vector3): Vec3Like {
    return {
      x: vector.x,
      y: vector.y,
      z: vector.z
    }
  }

  private _serializeEuler(euler: THREE.Euler): SerializedEuler {
    return {
      x: euler.x,
      y: euler.y,
      z: euler.z,
      order: euler.order
    }
  }

  private _serializeQuaternion(quaternion: THREE.Quaternion): Vec4Like {
    return {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w
    }
  }

  private _serializeCamera(camera?: THREE.PerspectiveCamera | null): SerializedCamera | null {
    if (!camera) return null

    return {
      position: this._serializeVector3(camera.position),
      rotation: this._serializeEuler(camera.rotation),
      fov: camera.fov,
      zoom: camera.zoom
    }
  }

  private _applyVector3(target: THREE.Vector3, data?: Vec3Like | null): void {
    if (!data) return
    target.set(data.x, data.y, data.z)
  }

  private _applyEuler(target: THREE.Euler, data?: SerializedEuler | null): void {
    if (!data) return
    target.set(data.x, data.y, data.z, data.order || 'XYZ')
  }

  private _applyQuaternion(target: THREE.Quaternion, data?: Vec4Like | null): void {
    if (!data) return
    target.set(data.x, data.y, data.z, data.w)
  }

  createThumbnail(
    canvas: HTMLCanvasElement,
    size: ThumbnailSize = { width: 256, height: 256 }
  ): string {
    const thumbnailCanvas = document.createElement('canvas')
    thumbnailCanvas.width = size.width
    thumbnailCanvas.height = size.height

    const ctx = thumbnailCanvas.getContext('2d')!

    ctx.drawImage(
      canvas,
      0, 0, canvas.width, canvas.height,
      0, 0, size.width, size.height
    )

    return thumbnailCanvas.toDataURL('image/jpeg', 0.8)
  }
}

export interface StoredPose {
  id: string
  poseData: SerializedPose
  thumbnail: string | null
  addedAt: string
  updatedAt?: string
}

export interface SerializedLibrary {
  version?: string
  exportedAt?: string
  poses: StoredPose[]
}

export type ImportMode = 'merge' | 'replace'

export class PoseLibrary {
  poses: StoredPose[]
  storageKey: string

  constructor() {
    this.poses = []
    this.storageKey = 'pose-three_pose_library'
    this.loadFromLocalStorage()
  }

  addPose(poseData: SerializedPose, thumbnail: string | null = null): string {
    const pose: StoredPose = {
      id: this._generateId(),
      poseData: poseData,
      thumbnail: thumbnail,
      addedAt: new Date().toISOString()
    }

    this.poses.push(pose)
    this.saveToLocalStorage()

    return pose.id
  }

  getPose(id: string): StoredPose | undefined {
    return this.poses.find((p) => p.id === id)
  }

  getAllPoses(): StoredPose[] {
    return this.poses
  }

  deletePose(id: string): boolean {
    const index = this.poses.findIndex((p) => p.id === id)
    if (index !== -1) {
      this.poses.splice(index, 1)
      this.saveToLocalStorage()
      return true
    }
    return false
  }

  updatePose(id: string, poseData: SerializedPose, thumbnail: string | null = null): boolean {
    const pose = this.getPose(id)
    if (pose) {
      pose.poseData = poseData
      if (thumbnail) {
        pose.thumbnail = thumbnail
      }
      pose.updatedAt = new Date().toISOString()
      this.saveToLocalStorage()
      return true
    }
    return false
  }

  searchPoses(query: string): StoredPose[] {
    const lowerQuery = query.toLowerCase()
    return this.poses.filter((pose) => {
      const name = pose.poseData.metadata.name.toLowerCase()
      const description = pose.poseData.metadata.description.toLowerCase()
      const tags = pose.poseData.metadata.tags.join(' ').toLowerCase()

      return name.includes(lowerQuery) ||
             description.includes(lowerQuery) ||
             tags.includes(lowerQuery)
    })
  }

  saveToLocalStorage(): void {
    try {
      const data = JSON.stringify(this.poses)
      localStorage.setItem(this.storageKey, data)
    } catch (error) {
      console.error('Failed to save pose library:', error)
    }
  }

  loadFromLocalStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey)
      if (data) {
        this.poses = JSON.parse(data)
      }
    } catch (error) {
      console.error('Failed to load pose library:', error)
      this.poses = []
    }
  }

  clearLibrary(): void {
    this.poses = []
    this.saveToLocalStorage()
  }

  exportLibrary(filename: string = 'pose_library.json'): void {
    const data: SerializedLibrary = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      poses: this.poses
    }

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
  }

  async importLibrary(file: File, mode: ImportMode = 'merge'): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string) as SerializedLibrary

          if (!data.poses || !Array.isArray(data.poses)) {
            reject(new Error('Invalid library file'))
            return
          }

          if (mode === 'replace') {
            this.poses = data.poses
          } else {

            data.poses.forEach((pose) => {

              pose.id = this._generateId()
              this.poses.push(pose)
            })
          }

          this.saveToLocalStorage()
          resolve(data.poses.length)
        } catch (error) {
          reject(new Error(`Failed to import library: ${error instanceof Error ? error.message : String(error)}`))
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsText(file)
    })
  }

  private _generateId(): string {
    return `pose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}
