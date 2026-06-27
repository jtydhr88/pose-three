import * as THREE from 'three'
import type { PosingModel } from './PosingModel'

export interface OpenPoseImportOptions {
  depth?: number
  useIK?: boolean
}

export interface OpenPoseData {
  people: Array<{
    pose_keypoints_2d?: number[]
    pose_keypoints_3d?: number[]
  }>
  canvas_width?: number
  canvas_height?: number
}

export interface OpenPoseKeypoint {
  x: number
  y: number
  confidence: number
}

export interface OpenPoseResult {
  keypoints: Record<string, THREE.Vector3>
  confidence: number
  imageSize: { width: number; height: number }
}

const KEYPOINT_INDICES = {
  NOSE: 0,
  NECK: 1,
  R_SHOULDER: 2,
  R_ELBOW: 3,
  R_WRIST: 4,
  L_SHOULDER: 5,
  L_ELBOW: 6,
  L_WRIST: 7,
  MID_HIP: 8,
  R_HIP: 9,
  R_KNEE: 10,
  R_ANKLE: 11,
  L_HIP: 12,
  L_KNEE: 13,
  L_ANKLE: 14,
  R_EYE: 15,
  L_EYE: 16,
  R_EAR: 17,
  L_EAR: 18
}

export class OpenPoseConverter {
  private posingModel: PosingModel
  private skeleton: THREE.Skeleton
  private bones: Map<string, THREE.Bone>

  constructor(posingModel: PosingModel) {
    this.posingModel = posingModel

    if (posingModel.skinnedMeshes.length === 0) {
      throw new Error('No skinned meshes found in model')
    }

    this.skeleton = posingModel.skinnedMeshes[0].skeleton
    this.bones = new Map()

    this.skeleton.bones.forEach((bone) => {
      this.bones.set(bone.name, bone)
    })
  }

  async loadFromFile(file: File, options: OpenPoseImportOptions = {}): Promise<OpenPoseResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        try {
          let jsonData = JSON.parse(reader.result as string)

          if (Array.isArray(jsonData) && jsonData.length > 0) {
            jsonData = jsonData[0]
          }

          const result = this.loadFromOpenPoseData(jsonData as OpenPoseData, options)
          resolve(result)
        } catch (error) {
          reject(new Error(`Failed to parse OpenPose JSON: ${(error as Error).message}`))
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsText(file)
    })
  }

  loadFromOpenPoseData(
    openPoseData: OpenPoseData,
    options: OpenPoseImportOptions = {}
  ): OpenPoseResult {
    if (!openPoseData.people || openPoseData.people.length === 0) {
      throw new Error('No people detected in OpenPose data')
    }

    const person = openPoseData.people[0]
    const keypointsArray = person.pose_keypoints_2d

    if (!keypointsArray) {
      throw new Error('No 2D keypoints found')
    }

    const keypoints = this.parseKeypoints(keypointsArray)
    const imgWidth = openPoseData.canvas_width || 512
    const imgHeight = openPoseData.canvas_height || 512

    const positions3D = this.convertTo3D(keypoints, imgWidth, imgHeight, options.depth || 0)

    const confidence = this.calculateAverageConfidence(keypoints)

    console.log('OpenPose keypoints parsed:', Object.keys(keypoints).length)
    console.log('Average confidence:', (confidence * 100).toFixed(1) + '%')
    console.log('3D positions:', positions3D)

    return {
      keypoints: positions3D,
      confidence,
      imageSize: { width: imgWidth, height: imgHeight }
    }
  }

  private parseKeypoints(array: number[]): Record<string, OpenPoseKeypoint> {
    const keypoints: Record<string, OpenPoseKeypoint> = {}

    for (const [name, idx] of Object.entries(KEYPOINT_INDICES)) {
      const base = idx * 3
      if (base + 2 < array.length) {
        keypoints[name] = {
          x: array[base],
          y: array[base + 1],
          confidence: array[base + 2]
        }
      }
    }

    return keypoints
  }

  private calculateAverageConfidence(keypoints: Record<string, OpenPoseKeypoint>): number {
    let sum = 0
    let count = 0

    for (const point of Object.values(keypoints)) {
      if (point.confidence > 0) {
        sum += point.confidence
        count++
      }
    }

    return count > 0 ? sum / count : 0
  }

  private convertTo3D(
    keypoints: Record<string, OpenPoseKeypoint>,
    _imgWidth: number,
    _imgHeight: number,
    baseDepth: number
  ): Record<string, THREE.Vector3> {
    const positions: Record<string, THREE.Vector3> = {}

    const scale = 100

    for (const [name, point] of Object.entries(keypoints)) {
      if (point.confidence < 0.1) continue

      positions[name] = new THREE.Vector3(
        (point.x - 0.5) * scale,
        -(point.y - 0.5) * scale,
        baseDepth
      )
    }

    return positions
  }

  applyToModel(result: OpenPoseResult, _options: OpenPoseImportOptions = {}): void {
    const positions = result.keypoints

    const getBone = (boneName: string): THREE.Bone | null => {

      const patterns = [
        boneName,
        `mixamorig${boneName}`,
        `mixamorig1${boneName}`,
        boneName.toLowerCase(),
      ]

      for (const pattern of patterns) {
        for (const [name, bone] of this.bones.entries()) {
          if (name === pattern || name.toLowerCase() === pattern.toLowerCase()) {
            return bone
          }
        }
      }

      console.warn(`Bone not found: ${boneName}`)
      return null
    }

    const setBoneRotation = (bone: THREE.Bone, fromPos: THREE.Vector3, toPos: THREE.Vector3) => {
      if (!bone || !bone.parent) return

      bone.parent.updateMatrixWorld(true)

      const localFrom = bone.parent.worldToLocal(fromPos.clone())
      const localTo = bone.parent.worldToLocal(toPos.clone())

      const targetDirection = new THREE.Vector3().subVectors(localTo, localFrom).normalize()

      const boneDirection = bone.position.clone().normalize()

      if (boneDirection.length() < 0.001) {
        boneDirection.set(0, 1, 0)
      }

      const quaternion = new THREE.Quaternion()
      quaternion.setFromUnitVectors(boneDirection, targetDirection)

      bone.quaternion.copy(quaternion)
      bone.updateMatrixWorld(true)
    }

    try {
      console.log('Starting FK pose application...')

      this.posingModel.resetPose()
      console.log('Pose reset to T-pose')

      if (positions.MID_HIP && positions.NECK) {
        const spine = getBone('Spine')
        if (spine) {
          console.log('Setting Spine rotation')
          setBoneRotation(spine, positions.MID_HIP, positions.NECK)
        }
      }

      if (positions.NECK && positions.NOSE) {
        const neck = getBone('Neck')
        if (neck) {
          console.log('Setting Neck rotation')
          setBoneRotation(neck, positions.NECK, positions.NOSE)
        }
      }

      if (positions.L_SHOULDER && positions.L_ELBOW) {
        const leftArm = getBone('LeftArm')
        if (leftArm) {
          console.log('Setting LeftArm rotation')
          setBoneRotation(leftArm, positions.L_SHOULDER, positions.L_ELBOW)
        }
      }

      if (positions.L_ELBOW && positions.L_WRIST) {
        const leftForeArm = getBone('LeftForeArm')
        if (leftForeArm) {
          console.log('Setting LeftForeArm rotation')
          setBoneRotation(leftForeArm, positions.L_ELBOW, positions.L_WRIST)
        }
      }

      if (positions.R_SHOULDER && positions.R_ELBOW) {
        const rightArm = getBone('RightArm')
        if (rightArm) {
          console.log('Setting RightArm rotation')
          setBoneRotation(rightArm, positions.R_SHOULDER, positions.R_ELBOW)
        }
      }

      if (positions.R_ELBOW && positions.R_WRIST) {
        const rightForeArm = getBone('RightForeArm')
        if (rightForeArm) {
          console.log('Setting RightForeArm rotation')
          setBoneRotation(rightForeArm, positions.R_ELBOW, positions.R_WRIST)
        }
      }

      if (positions.L_HIP && positions.L_KNEE) {
        const leftUpLeg = getBone('LeftUpLeg')
        if (leftUpLeg) {
          console.log('Setting LeftUpLeg rotation')
          setBoneRotation(leftUpLeg, positions.L_HIP, positions.L_KNEE)
        }
      }

      if (positions.L_KNEE && positions.L_ANKLE) {
        const leftLeg = getBone('LeftLeg')
        if (leftLeg) {
          console.log('Setting LeftLeg rotation')
          setBoneRotation(leftLeg, positions.L_KNEE, positions.L_ANKLE)
        }
      }

      if (positions.R_HIP && positions.R_KNEE) {
        const rightUpLeg = getBone('RightUpLeg')
        if (rightUpLeg) {
          console.log('Setting RightUpLeg rotation')
          setBoneRotation(rightUpLeg, positions.R_HIP, positions.R_KNEE)
        }
      }

      if (positions.R_KNEE && positions.R_ANKLE) {
        const rightLeg = getBone('RightLeg')
        if (rightLeg) {
          console.log('Setting RightLeg rotation')
          setBoneRotation(rightLeg, positions.R_KNEE, positions.R_ANKLE)
        }
      }

      this.skeleton.bones[0].updateMatrixWorld(true)

      console.log('✅ Pose applied successfully using FK')
    } catch (error) {
      console.error('❌ Failed to apply pose:', error)
      throw error
    }
  }
}
