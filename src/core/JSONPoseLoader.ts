import * as THREE from 'three'
import type { PoseData, BoneTransform } from './types'
import type { PosingModel } from './PosingModel'

export class JSONPoseLoader {

  async loadFromFile(file: File): Promise<PoseData> {
    if (!file) {
      throw new Error('No file provided')
    }

    if (!file.name.endsWith('.json') && !file.name.endsWith('.pose.json')) {
      throw new Error('Invalid file type. Expected .json or .pose.json')
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        try {
          const poseData = JSON.parse(reader.result as string) as PoseData
          this.validatePoseData(poseData)
          resolve(poseData)
        } catch (error) {
          reject(new Error(`Failed to parse pose file: ${(error as Error).message}`))
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsText(file)
    })
  }

  async loadFromURL(url: string, onProgress: ((progress: number) => void) | null = null): Promise<PoseData> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.open('GET', url, true)
      xhr.responseType = 'text'

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const poseData = JSON.parse(xhr.response) as PoseData
            this.validatePoseData(poseData)
            resolve(poseData)
          } catch (error) {
            reject(new Error(`Failed to parse JSON file: ${(error as Error).message}`))
          }
        } else {
          reject(new Error(`Failed to load JSON file: HTTP ${xhr.status}`))
        }
      }

      xhr.onerror = () => {
        reject(new Error('Network error while loading JSON file'))
      }

      if (onProgress) {
        xhr.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100
            onProgress(percentComplete)
          }
        }
      }

      xhr.send()
    })
  }

  saveToJSONFile(poseData: PoseData, filename: string = 'pose.pose.json'): void {
    const jsonString = JSON.stringify(poseData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
  }

  applyPoseToModel(poseData: PoseData, posingModel: PosingModel): void {
    if (!poseData || !posingModel) {
      throw new Error('Invalid pose data or posing model')
    }

    if (!poseData.bones || !Array.isArray(poseData.bones)) {
      throw new Error('Invalid JSON file format: missing bones array')
    }

    posingModel.skinnedMeshes.forEach((skinnedMesh: THREE.SkinnedMesh, meshIndex: number) => {
      const bones = skinnedMesh.skeleton.bones

      const meshBoneData = poseData.bones[meshIndex]
      if (!meshBoneData) return

      Object.keys(meshBoneData).forEach((boneName) => {
        const boneTransform = meshBoneData[boneName]

        const bone = bones.find((b: THREE.Bone) => {

          const normalizeName = (name: string) => {
            return name.toLowerCase()
              .replace(/mixamorig[:_\-1]/g, 'mixamorig');
          };

          const normalizedBoneName = normalizeName(b.name);
          const normalizedSearchName = normalizeName(boneName);

          return normalizedBoneName === normalizedSearchName;
        })

        if (!bone) {
          console.warn(`Bone not found: ${boneName}`)
          return
        }

        if (boneTransform.rotation) {
          bone.rotation.set(
            boneTransform.rotation.x || 0,
            boneTransform.rotation.y || 0,
            boneTransform.rotation.z || 0
          )
        }

        if (boneTransform.position) {
          bone.position.set(
            boneTransform.position.x || 0,
            boneTransform.position.y || 0,
            boneTransform.position.z || 0
          )
        }

        if (boneTransform.quaternion) {
          bone.quaternion.set(
            boneTransform.quaternion.x || 0,
            boneTransform.quaternion.y || 0,
            boneTransform.quaternion.z || 0,
            boneTransform.quaternion.w || 1
          )
        }

        if (boneTransform.scale) {
          bone.scale.set(
            boneTransform.scale.x || 1,
            boneTransform.scale.y || 1,
            boneTransform.scale.z || 1
          )
        }

        bone.updateMatrix()
        bone.updateMatrixWorld(true)
      })
    })
  }

  createPoseDataFromModel(posingModel: PosingModel): PoseData {
    const poseData: PoseData = {
      bones: []
    }

    posingModel.skinnedMeshes.forEach((skinnedMesh: THREE.SkinnedMesh) => {
      const bones = skinnedMesh.skeleton.bones
      const boneData: Record<string, BoneTransform> = {}

      bones.forEach((bone: THREE.Bone) => {
        boneData[bone.name] = {
          position: {
            x: bone.position.x,
            y: bone.position.y,
            z: bone.position.z
          },
          rotation: {
            x: bone.rotation.x,
            y: bone.rotation.y,
            z: bone.rotation.z
          },
          quaternion: {
            x: bone.quaternion.x,
            y: bone.quaternion.y,
            z: bone.quaternion.z,
            w: bone.quaternion.w
          },
          scale: {
            x: bone.scale.x,
            y: bone.scale.y,
            z: bone.scale.z
          }
        }
      })

      poseData.bones.push(boneData)
    })

    return poseData
  }

  validatePoseData(poseData: PoseData): void {
    if (!poseData.bones || !Array.isArray(poseData.bones)) {
      throw new Error('Invalid pose format: missing bones array')
    }

    if (poseData.bones.length === 0) {
      throw new Error('Invalid pose format: bones array is empty')
    }
  }

  loadHandPose(
    poseData: PoseData,
    posingModel: PosingModel,
    targetHand: 'left' | 'right',
    sourceHand: 'left' | 'right'
  ): void {
    if (!poseData || !posingModel) {
      throw new Error('Invalid pose data or posing model')
    }

    if (!poseData.bones || !Array.isArray(poseData.bones)) {
      throw new Error('Invalid JSON file format: missing bones array')
    }

    const sourcePrefix = sourceHand === 'left' ? 'mixamorigLeft' : 'mixamorigRight'
    const targetPrefix = targetHand === 'left' ? 'mixamorigLeft' : 'mixamorigRight'

    const handBones = [
      'Hand',
      'HandThumb1',
      'HandThumb2',
      'HandThumb3',
      'HandIndex1',
      'HandIndex2',
      'HandIndex3',
      'HandMiddle1',
      'HandMiddle2',
      'HandMiddle3',
      'HandRing1',
      'HandRing2',
      'HandRing3',
      'HandPinky1',
      'HandPinky2',
      'HandPinky3'
    ]

    posingModel.skinnedMeshes.forEach((skinnedMesh: THREE.SkinnedMesh, meshIndex: number) => {
      const bones = skinnedMesh.skeleton.bones
      const meshBoneData = poseData.bones[meshIndex]
      if (!meshBoneData) return

      handBones.forEach((boneSuffix) => {
        const sourceBoneName = sourcePrefix + boneSuffix
        const targetBoneName = targetPrefix + boneSuffix

        const boneTransform = meshBoneData[sourceBoneName]
        if (!boneTransform) return

        const bone = bones.find((b: THREE.Bone) => b.name === targetBoneName)
        if (!bone) {
          console.warn(`Target bone not found: ${targetBoneName}`)
          return
        }

        if (boneTransform.rotation) {
          bone.rotation.set(
            boneTransform.rotation.x || 0,
            boneTransform.rotation.y || 0,
            boneTransform.rotation.z || 0
          )
        }

        if (boneTransform.position) {
          bone.position.set(
            boneTransform.position.x || 0,
            boneTransform.position.y || 0,
            boneTransform.position.z || 0
          )
        }

        if (boneTransform.quaternion) {
          bone.quaternion.set(
            boneTransform.quaternion.x || 0,
            boneTransform.quaternion.y || 0,
            boneTransform.quaternion.z || 0,
            boneTransform.quaternion.w || 1
          )
        }

        if (boneTransform.scale) {
          bone.scale.set(
            boneTransform.scale.x || 1,
            boneTransform.scale.y || 1,
            boneTransform.scale.z || 1
          )
        }

        bone.updateMatrix()
        bone.updateMatrixWorld(true)
      })
    })
  }
}

export async function loadJSONPoseFile(file: File): Promise<PoseData> {
  const loader = new JSONPoseLoader()
  return await loader.loadFromFile(file)
}

export async function loadJSONPoseFromURL(url: string, onProgress: ((progress: number) => void) | null = null): Promise<PoseData> {
  const loader = new JSONPoseLoader()
  return await loader.loadFromURL(url, onProgress)
}
