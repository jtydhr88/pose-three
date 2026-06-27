import * as THREE from 'three'

export interface Humanoid {
  group: THREE.Group
  mesh: THREE.SkinnedMesh
  bones: Record<string, THREE.Bone>
  boneList: THREE.Bone[]
}

export interface BuildHumanoidOptions {

  withIKTargets?: boolean

  includeHands?: boolean

  prefix?: string
}

export function buildHumanoid(options: BuildHumanoidOptions = {}): Humanoid {
  const { withIKTargets = false, includeHands = true, prefix = 'mixamorig' } = options

  const bones: Record<string, THREE.Bone> = {}
  const boneList: THREE.Bone[] = []

  const add = (suffix: string, parent: THREE.Bone | null, offset: [number, number, number]): THREE.Bone => {
    const bone = new THREE.Bone()
    bone.name = prefix + suffix
    bone.position.set(offset[0], offset[1], offset[2])
    if (parent) parent.add(bone)
    bones[suffix] = bone
    boneList.push(bone)
    return bone
  }

  const hips = add('Hips', null, [0, 100, 0])
  const spine = add('Spine', hips, [0, 10, 0])
  const spine1 = add('Spine1', spine, [0, 10, 0])
  const spine2 = add('Spine2', spine1, [0, 10, 0])
  const neck = add('Neck', spine2, [0, 10, 0])
  add('Head', neck, [0, 10, 0])

  const lShoulder = add('LeftShoulder', spine2, [-5, 5, 0])
  const lArm = add('LeftArm', lShoulder, [-10, 0, 0])
  const lForeArm = add('LeftForeArm', lArm, [-10, 0, 0])
  const lHand = add('LeftHand', lForeArm, [-10, 0, 0])

  const rShoulder = add('RightShoulder', spine2, [5, 5, 0])
  const rArm = add('RightArm', rShoulder, [10, 0, 0])
  const rForeArm = add('RightForeArm', rArm, [10, 0, 0])
  const rHand = add('RightHand', rForeArm, [10, 0, 0])

  const lUpLeg = add('LeftUpLeg', hips, [-5, -10, 0])
  const lLeg = add('LeftLeg', lUpLeg, [0, -15, 0])
  add('LeftFoot', lLeg, [0, -15, 0])

  const rUpLeg = add('RightUpLeg', hips, [5, -10, 0])
  const rLeg = add('RightLeg', rUpLeg, [0, -15, 0])
  add('RightFoot', rLeg, [0, -15, 0])

  if (includeHands) {
    for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      let lPrev = lHand
      let rPrev = rHand
      for (let seg = 1; seg <= 3; seg++) {
        lPrev = add(`LeftHand${finger}${seg}`, lPrev, [-2, 0, 0])
        rPrev = add(`RightHand${finger}${seg}`, rPrev, [2, 0, 0])
      }
    }
  }

  if (withIKTargets) {
    add('LeftHand_IKTarget', lHand, [-1, 0, 0])
    add('RightFoot_IKTarget', bones['RightFoot'], [0, -1, 0])
  }

  const geometry = new THREE.BoxGeometry(20, 60, 10)
  const vertexCount = geometry.getAttribute('position').count
  const skinIndices: number[] = []
  const skinWeights: number[] = []
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(0, 0, 0, 0)
    skinWeights.push(1, 0, 0, 0)
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
  mesh.add(hips)
  const skeleton = new THREE.Skeleton(boneList)
  mesh.bind(skeleton)

  const group = new THREE.Group()
  group.add(mesh)
  group.updateMatrixWorld(true)

  return { group, mesh, bones, boneList }
}
