import * as THREE from 'three'
import { CCDIKSolver } from './CCDIKSolver'
import type {
  ModelConfig,
  PoseData,
  BoneTransform,
  BoneSnapshot,
  IKConfig,
  IKLink,
  FKController,
  IKController,
  RootController,
  PoseController,
} from './types'

export const IK_CHAINS: string[][] = [
  ['LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHand_IKTarget'],
  ['LeftArm', 'LeftForeArm', 'LeftForeArm_IKTarget'],
  ['LeftShoulder', 'LeftArm', 'LeftArm_IKTarget'],
  ['RightArm', 'RightForeArm', 'RightHand', 'RightHand_IKTarget'],
  ['RightArm', 'RightForeArm', 'RightForeArm_IKTarget'],
  ['RightShoulder', 'RightArm', 'RightArm_IKTarget'],
  ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftFoot_IKTarget'],
  ['LeftUpLeg', 'LeftLeg', 'LeftLeg_IKTarget'],
  ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightFoot_IKTarget'],
  ['RightUpLeg', 'RightLeg', 'RightLeg_IKTarget'],
]

export const BONE_NAMES: string[] = [
  'RightUpLeg', 'LeftUpLeg', 'RightLeg', 'LeftLeg', 'RightFoot', 'LeftFoot',
  'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm',
  'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand',
]

export const HAND_BONE_NAMES: string[] = [
  'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
  'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
  'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
  'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3',
  'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
  'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
  'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
  'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
  'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
  'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
]

const BONE_COLORS: Record<string, number> = {
  Head: 0xff0000,
  Neck: 0xff8800,
  Spine: 0xffff00,
  Spine1: 0xffff00,
  Spine2: 0xffff00,
  LeftShoulder: 0x00ff00,
  RightShoulder: 0x00ff00,
  LeftArm: 0x00ff88,
  RightArm: 0xff8800,
  LeftForeArm: 0x00ffff,
  RightForeArm: 0xffff00,
  LeftHand: 0x0088ff,
  RightHand: 0xff8800,
  LeftUpLeg: 0x0000ff,
  RightUpLeg: 0xff0000,
  LeftLeg: 0x8800ff,
  RightLeg: 0xff8800,
  LeftFoot: 0xff00ff,
  RightFoot: 0xff0088,
}

export class PosingModel {
  mesh: THREE.Object3D
  modelConfig: ModelConfig
  skinnedMeshes: THREE.SkinnedMesh[] = []
  boneControllers: PoseController[] = []
  ikSolvers: CCDIKSolver[] = []
  hipsController: THREE.Bone | null = null
  modelRootController: RootController | null = null
  originalBoneTransforms: Map<string, BoneSnapshot> = new Map()

  constructor(mesh: THREE.Object3D, modelConfig: ModelConfig) {
    this.mesh = mesh
    this.modelConfig = modelConfig
    this._init()
  }

  private _init(): void {
    console.log('========== PosingModel INIT START ==========')

    this.mesh.traverse((object) => {
      const sm = object as THREE.SkinnedMesh
      if (sm.isSkinnedMesh) {
        this.skinnedMeshes.push(sm)
        sm.frustumCulled = false
        console.log('Found skinned mesh:', sm.name)
      }
    })

    console.log('Total skinned meshes found:', this.skinnedMeshes.length)

    if (this.skinnedMeshes.length === 0) {
      console.warn('No skinned meshes found in model')
      return
    }

    const skinnedMesh = this.skinnedMeshes[0]
    const bones = skinnedMesh.skeleton.bones

    console.log('Total bones in skeleton:', bones.length)
    console.log('All bone names:', bones.map((b) => b.name).join(', '))

    bones.forEach((bone) => {
      this.originalBoneTransforms.set(bone.uuid, {
        position: bone.position.clone(),
        rotation: bone.rotation.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      })
    })

    const boneNameToIndex = this._getBoneNameToIndexMap(skinnedMesh)
    console.log('Bone name to index map created with', Object.keys(boneNameToIndex).length, 'entries')

    this._createIKControllers(skinnedMesh, bones, boneNameToIndex)
    this._createFKControllers(bones)
    this._createModelRootController()

    console.log('========== PosingModel INIT END ==========')
  }

  private _getBoneNameToIndexMap(skinnedMesh: THREE.SkinnedMesh): Record<string, number> {
    const map: Record<string, number> = {}
    const bones = skinnedMesh.skeleton.bones
    bones.forEach((bone, index) => {
      map[bone.name] = index
    })
    return map
  }

  private _createIKControllers(
    skinnedMesh: THREE.SkinnedMesh,
    bones: THREE.Bone[],
    boneNameToIndex: Record<string, number>
  ): void {
    const boneSize = this.modelConfig.boneSize || 4
    const handBoneSize = this.modelConfig.handBoneSize || 1

    console.log('===== Creating IK Controllers =====')
    console.log('Total IK chains to attempt:', IK_CHAINS.length)

    let createdIKCount = 0

    for (const chain of IK_CHAINS) {
      console.log('\n--- Checking IK Chain:', chain.join(' -> '))
      const boneIndices: number[] = []
      let invalid = false
      const missingBones: string[] = []
      let createdVirtualTarget = false

      for (let i = 0; i < chain.length; i++) {
        const boneName = chain[i]
        const boneKey = Object.keys(boneNameToIndex).find((key) => key.endsWith(boneName))
        let index: number | undefined = boneKey !== undefined ? boneNameToIndex[boneKey] : undefined

        console.log(
          `  Looking for bone "${boneName}":`,
          boneKey ? `Found as "${boneKey}" (index: ${index})` : 'NOT FOUND'
        )

        if (index === undefined && i === chain.length - 1 && boneName.includes('_IKTarget')) {
          console.log('  -> Missing IK Target bone. Attempting to create virtual target...')

          const effectorBoneName = chain[i - 1]
          const effectorBoneKey = Object.keys(boneNameToIndex).find((key) =>
            key.endsWith(effectorBoneName)
          )

          if (effectorBoneKey) {
            const effectorBone = bones[boneNameToIndex[effectorBoneKey]]

            const rootBone = bones.find((b) => b.name.endsWith('Hips'))
            if (!rootBone) {
              console.error('  -> Cannot create virtual target: Hips bone not found')
              invalid = true
              missingBones.push(boneName)
              break
            }

            const virtualTarget = new THREE.Bone()
            virtualTarget.name = effectorBone.name + '_IKTarget'

            effectorBone.updateMatrixWorld(true)
            const effectorWorldPos = new THREE.Vector3()
            effectorBone.getWorldPosition(effectorWorldPos)

            rootBone.updateMatrixWorld(true)
            const localPos = rootBone.worldToLocal(effectorWorldPos.clone())
            virtualTarget.position.copy(localPos)

            rootBone.add(virtualTarget)

            virtualTarget.updateMatrix()
            virtualTarget.updateMatrixWorld(true)

            const newIndex = bones.length
            bones.push(virtualTarget)

            if (skinnedMesh.skeleton.boneInverses) {
              skinnedMesh.skeleton.boneInverses.push(new THREE.Matrix4())
            }

            skinnedMesh.skeleton.bones = bones

            index = newIndex
            boneNameToIndex[virtualTarget.name] = index

            console.log(
              `  -> Created virtual target: "${virtualTarget.name}" (index: ${index}), attached to root, world pos:`,
              effectorWorldPos
            )
            createdVirtualTarget = true
          } else {
            invalid = true
            missingBones.push(boneName)
            break
          }
        }

        if (index === undefined) {
          invalid = true
          missingBones.push(boneName)
          break
        }
        boneIndices.push(index)
      }

      if (invalid) {
        console.warn('  SKIPPED: Chain is invalid. Missing bones:', missingBones.join(', '))
        continue
      }

      if (createdVirtualTarget) {
        console.log('  SUCCESS: Chain completed with virtual IK target')
      } else {
        console.log('  SUCCESS: All bones found for this chain')
      }

      const targetIndex = boneIndices[boneIndices.length - 1]
      const effectorIndex = boneIndices[boneIndices.length - 2]
      const linkIndices: IKLink[] = boneIndices
        .slice(0, -2)
        .reverse()
        .map((idx) => ({ index: idx }))

      console.log('  Target bone:', bones[targetIndex].name)
      console.log('  Effector bone:', bones[effectorIndex].name)
      console.log('  Link bones:', linkIndices.map((l) => bones[l.index].name).join(', '))

      const ikData: IKConfig[] = [
        {
          target: targetIndex,
          effector: effectorIndex,
          links: linkIndices,
          iteration: 5,
        },
      ]

      const isHand = chain[chain.length - 2].includes('Hand')
      const controllerSize = isHand ? handBoneSize * 5 : boneSize * 2.8

      const geometry = new THREE.BoxGeometry(controllerSize, controllerSize, controllerSize)
      const material = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        opacity: 0.5,
        transparent: true,
        depthTest: false,
      })
      const controller = new THREE.Mesh(geometry, material) as unknown as IKController
      controller.renderOrder = 1
      controller.name = 'BoneControllerIK'
      controller.visible = false
      controller.posingModel = this

      const ikSolver = new CCDIKSolver(skinnedMesh, ikData)
      controller.ikSolver = ikSolver
      controller.targetBone = bones[targetIndex]
      controller.effectorBone = bones[effectorIndex]
      controller.ikLinkBoneIndexes = boneIndices

      bones[effectorIndex].add(controller)
      this.boneControllers.push(controller)
      this.ikSolvers.push(ikSolver)

      createdIKCount++
      console.log('  IK Controller created successfully!')
    }

    console.log('\n===== IK Controller Summary =====')
    console.log('Created IK controllers:', createdIKCount)
    console.log('Total IK solvers:', this.ikSolvers.length)
  }

  private _createFKControllers(bones: THREE.Bone[]): void {
    const boneSize = this.modelConfig.boneSize || 4
    const handBoneSize = this.modelConfig.handBoneSize || 1
    const hipBoneName = this.modelConfig.hipBoneName || 'Hips'

    console.log('\n===== Creating FK Controllers =====')
    console.log('Total bones to check:', bones.length)

    let createdFKCount = 0

    bones.forEach((bone) => {
      const isBone = BONE_NAMES.some((name) => bone.name.endsWith(name))
      const isHandBone = HAND_BONE_NAMES.some((name) => bone.name.endsWith(name))

      if (!isBone && !isHandBone) return

      console.log(`Creating FK controller for bone: ${bone.name}`)

      let size = boneSize
      if (isHandBone) size = handBoneSize
      if (bone.name.endsWith(hipBoneName)) size = this.modelConfig.hipBoneSize || 4

      const colorKey = Object.keys(BONE_COLORS).find((key) => bone.name.endsWith(key))
      const color = (colorKey !== undefined ? BONE_COLORS[colorKey] : undefined) || 0x888888

      const geometry = new THREE.SphereGeometry(size, 8, 8)
      const material = new THREE.MeshBasicMaterial({
        color: color,
        depthTest: false,
        transparent: false,
        opacity: 1.0,
      })
      const controller = new THREE.Mesh(geometry, material) as unknown as FKController
      controller.renderOrder = 999
      controller.name = 'BoneController'
      controller.visible = false
      controller.posingModel = this
      controller.raycast = THREE.Mesh.prototype.raycast

      bone.add(controller)

      if (bone.name.endsWith(hipBoneName)) {
        this.hipsController = bone
        console.log('  -> This is the Hips controller')
      }

      this.boneControllers.push(controller)
      createdFKCount++
    })

    console.log('\n===== FK Controller Summary =====')
    console.log('Created FK controllers:', createdFKCount)
  }

  private _createModelRootController(): void {
    console.log('\n===== Creating Model Root Controller =====')

    const controllerSize = 4
    const geometry = new THREE.BoxGeometry(controllerSize, controllerSize, controllerSize)
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      opacity: 0.6,
      transparent: true,
      depthTest: false,
    })

    const controller = new THREE.Mesh(geometry, material) as unknown as RootController
    controller.renderOrder = 999
    controller.name = 'ModelRootController'
    controller.visible = false
    controller.posingModel = this

    this.mesh.updateMatrixWorld(true)

    const bbox = new THREE.Box3().setFromObject(this.mesh)
    const center = new THREE.Vector3()
    bbox.getCenter(center)

    controller.position.copy(center)

    const offset = new THREE.Vector3()
    offset.copy(center).sub(this.mesh.position)

    controller.userData.targetMesh = this.mesh
    controller.userData.meshOffset = offset

    if (this.mesh.parent) {
      this.mesh.parent.add(controller)
    }

    this.modelRootController = controller

    console.log('Model root controller created at world center:', controller.position)
    console.log('Mesh offset from controller:', offset)
  }

  showIKControllers(visible: boolean): void {
    this.boneControllers.forEach((controller) => {
      if (controller.name === 'BoneControllerIK') {
        controller.visible = visible
      }
    })
  }

  showFKControllers(visible: boolean): void {
    this.boneControllers.forEach((controller) => {
      if (controller.name === 'BoneController') {
        controller.visible = visible
      }
    })
  }

  showModelRootController(visible: boolean): void {
    if (this.modelRootController) {
      this.modelRootController.visible = visible
    }
  }

  updateIK(): void {
    this.ikSolvers.forEach((solver) => solver.update())
  }

  resetPose(): void {
    const bones = this.skinnedMeshes[0].skeleton.bones
    bones.forEach((bone) => {
      const original = this.originalBoneTransforms.get(bone.uuid)
      if (original) {
        bone.position.copy(original.position)
        bone.rotation.copy(original.rotation)
        bone.quaternion.copy(original.quaternion)
        bone.scale.copy(original.scale)
      }
    })
  }

  resetBone(bone: THREE.Bone): void {
    const original = this.originalBoneTransforms.get(bone.uuid)
    if (original) {
      bone.position.copy(original.position)
      bone.rotation.copy(original.rotation)
      bone.quaternion.copy(original.quaternion)
      bone.scale.copy(original.scale)
      console.log('Reset bone:', bone.name)
    } else {
      console.warn('No original transform found for bone:', bone.name)
    }
  }

  loadPoseFromJSON(poseData: PoseData): void {
    if (!poseData || !poseData.bones || !Array.isArray(poseData.bones)) {
      console.error('Invalid JSON pose data')
      return
    }

    this.skinnedMeshes.forEach((skinnedMesh, meshIndex) => {
      const bones = skinnedMesh.skeleton.bones

      const meshBoneData = poseData.bones[meshIndex]
      if (!meshBoneData) return

      Object.keys(meshBoneData).forEach((boneName) => {
        const boneTransform = meshBoneData[boneName]

        const bone = bones.find((b) => {
          const normalizedBoneName = b.name.toLowerCase().replace('mixamorig1', 'mixamorig')
          const normalizedSearchName = boneName.toLowerCase().replace('mixamorig1', 'mixamorig')
          return normalizedBoneName === normalizedSearchName
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

  loadHandPoseFromJSON(
    poseData: PoseData,
    targetHand: 'left' | 'right',
    sourceHand: 'left' | 'right'
  ): void {
    if (!poseData || !poseData.bones || !Array.isArray(poseData.bones)) {
      console.error('Invalid JSON pose data')
      return
    }

    let targetHandName = ''
    let targetPrefix = ''
    let sourcePrefix = ''

    if (targetHand === 'right') {
      targetHandName = 'RightHand'
      targetPrefix = 'Right'
    } else if (targetHand === 'left') {
      targetHandName = 'LeftHand'
      targetPrefix = 'Left'
    } else {
      console.error('Invalid target hand. Must be "left" or "right"')
      return
    }

    if (sourceHand === 'right') {
      sourcePrefix = 'Right'
    } else if (sourceHand === 'left') {
      sourcePrefix = 'Left'
    } else {
      console.error('Invalid source hand. Must be "left" or "right"')
      return
    }

    this.skinnedMeshes.forEach((skinnedMesh, meshIndex) => {
      const bones = skinnedMesh.skeleton.bones
      const meshBoneData = poseData.bones[meshIndex]
      if (!meshBoneData) return

      const handBoneNames = Object.keys(meshBoneData).filter((boneName) =>
        boneName.includes(targetHandName)
      )

      handBoneNames.forEach((boneName) => {
        let boneTransform: BoneTransform = meshBoneData[boneName]

        let finalBoneName = boneName
        if (targetHand !== sourceHand) {
          finalBoneName = boneName.replace(sourcePrefix, targetPrefix)

          if (boneTransform && boneTransform.rotation) {
            boneTransform = {
              rotation: {
                x: boneTransform.rotation.x,
                y: -boneTransform.rotation.y,
                z: -boneTransform.rotation.z,
              },
            }
          }
        }

        const bone = bones.find((b) => {
          const normalizedBoneName = b.name.toLowerCase().replace('mixamorig1', 'mixamorig')
          const normalizedSearchName = finalBoneName.toLowerCase().replace('mixamorig1', 'mixamorig')
          return normalizedBoneName === normalizedSearchName
        })

        if (!bone) {
          console.warn(`Hand bone not found: ${finalBoneName}`)
          return
        }

        if (boneTransform && boneTransform.rotation) {
          bone.rotation.set(
            boneTransform.rotation.x || 0,
            boneTransform.rotation.y || 0,
            boneTransform.rotation.z || 0
          )

          bone.updateMatrix()
          bone.updateMatrixWorld(true)
        }
      })
    })

    console.log(`Hand pose applied: target=${targetHand}, source=${sourceHand}`)
  }

  serializeToJSON(): PoseData {
    const poseData: PoseData = {
      bones: [],
    }

    this.skinnedMeshes.forEach((skinnedMesh) => {
      const bones = skinnedMesh.skeleton.bones
      const boneData: Record<string, BoneTransform> = {}

      bones.forEach((bone) => {
        boneData[bone.name] = {
          position: { x: bone.position.x, y: bone.position.y, z: bone.position.z },
          rotation: { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z },
          quaternion: {
            x: bone.quaternion.x,
            y: bone.quaternion.y,
            z: bone.quaternion.z,
            w: bone.quaternion.w,
          },
          scale: { x: bone.scale.x, y: bone.scale.y, z: bone.scale.z },
        }
      })

      poseData.bones.push(boneData)
    })

    return poseData
  }

  dispose(): void {
    this.boneControllers.forEach((controller) => {
      if (controller.geometry) controller.geometry.dispose()
      if (controller.material) controller.material.dispose()
    })
  }
}
