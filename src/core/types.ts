import * as THREE from 'three'
import type { PosingModel } from './PosingModel'
import type { CCDIKSolver } from './CCDIKSolver'

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface Vec4Like {
  x: number
  y: number
  z: number
  w: number
}

export interface BoneTransform {
  position?: Vec3Like
  rotation?: Vec3Like
  quaternion?: Vec4Like
  scale?: Vec3Like
}

export interface PoseData {
  bones: Array<Record<string, BoneTransform>>
}

export interface ModelConfig {
  boneSize: number
  handBoneSize: number
  hipBoneSize: number
  hipBoneName: string
}

export interface IKLink {
  index: number
  enabled?: boolean
  limitation?: THREE.Vector3
  rotationMin?: THREE.Vector3
  rotationMax?: THREE.Vector3
}

export interface IKConfig {
  effector: number
  target: number
  links: IKLink[]
  iteration?: number
  minAngle?: number
  maxAngle?: number
}

export interface ExportOptions {
  width: number
  height: number
  type?: string
}

export interface PoseMetadata {
  name: string
  description: string
  tags: string[]
  camera?: {
    position: THREE.Vector3
    rotation: THREE.Euler
    fov: number
    zoom: number
  }
}

export interface SavedPose {
  id: string
  poseData: PoseData
  thumbnail: string
  timestamp: number
}

export interface CropPosition {
  x: number
  y: number
}

export interface BoneSnapshot {
  position: THREE.Vector3
  rotation: THREE.Euler
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
}

type ControllerMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

export interface FKController extends ControllerMesh {
  name: 'BoneController'
  posingModel: PosingModel
}

export interface IKController extends ControllerMesh {
  name: 'BoneControllerIK'
  posingModel: PosingModel
  ikSolver: CCDIKSolver
  targetBone: THREE.Bone
  effectorBone: THREE.Bone
  ikLinkBoneIndexes: number[]
}

export interface RootController extends ControllerMesh {
  name: 'ModelRootController'
  posingModel: PosingModel
}

export type PoseController = FKController | IKController | RootController

export function isFKController(o: THREE.Object3D): o is FKController {
  return o.name === 'BoneController'
}

export function isIKController(o: THREE.Object3D): o is IKController {
  return o.name === 'BoneControllerIK'
}

export function isRootController(o: THREE.Object3D): o is RootController {
  return o.name === 'ModelRootController'
}
