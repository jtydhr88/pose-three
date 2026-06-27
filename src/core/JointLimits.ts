import type * as THREE from 'three'

export interface JointLimit {

  minX: number | null
  maxX: number | null
  minY: number | null
  maxY: number | null
  minZ: number | null
  maxZ: number | null
}

const deg2rad = (deg: number) => (deg * Math.PI) / 180

export const JOINT_LIMITS: Record<string, JointLimit> = {

  Spine: {
    minX: deg2rad(-30),
    maxX: deg2rad(45),
    minY: deg2rad(-25),
    maxY: deg2rad(25),
    minZ: deg2rad(-30),
    maxZ: deg2rad(30)
  },

  Spine1: {
    minX: deg2rad(-20),
    maxX: deg2rad(35),
    minY: deg2rad(-20),
    maxY: deg2rad(20),
    minZ: deg2rad(-25),
    maxZ: deg2rad(25)
  },

  Spine2: {
    minX: deg2rad(-20),
    maxX: deg2rad(30),
    minY: deg2rad(-15),
    maxY: deg2rad(15),
    minZ: deg2rad(-20),
    maxZ: deg2rad(20)
  },

  Neck: {
    minX: deg2rad(-40),
    maxX: deg2rad(50),
    minY: deg2rad(-45),
    maxY: deg2rad(45),
    minZ: deg2rad(-70),
    maxZ: deg2rad(70)
  },

  Head: {
    minX: deg2rad(-20),
    maxX: deg2rad(20),
    minY: deg2rad(-15),
    maxY: deg2rad(15),
    minZ: deg2rad(-15),
    maxZ: deg2rad(15)
  },

  LeftShoulder: {
    minX: deg2rad(-60),
    maxX: deg2rad(180),
    minY: deg2rad(-30),
    maxY: deg2rad(180),
    minZ: deg2rad(-90),
    maxZ: deg2rad(90)
  },

  RightShoulder: {
    minX: deg2rad(-60),
    maxX: deg2rad(180),
    minY: deg2rad(-180),
    maxY: deg2rad(30),
    minZ: deg2rad(-90),
    maxZ: deg2rad(90)
  },

  LeftArm: {
    minX: deg2rad(-60),
    maxX: deg2rad(180),
    minY: deg2rad(-30),
    maxY: deg2rad(180),
    minZ: deg2rad(-90),
    maxZ: deg2rad(90)
  },

  RightArm: {
    minX: deg2rad(-60),
    maxX: deg2rad(180),
    minY: deg2rad(-180),
    maxY: deg2rad(30),
    minZ: deg2rad(-90),
    maxZ: deg2rad(90)
  },

  LeftForeArm: {
    minX: null,
    maxX: null,
    minY: deg2rad(0),
    maxY: deg2rad(150),
    minZ: deg2rad(-90),
    maxZ: deg2rad(90)
  },

  RightForeArm: {
    minX: null,
    maxX: null,
    minY: deg2rad(-150),
    maxY: deg2rad(0),
    minZ: deg2rad(-90),
    maxZ: deg2rad(90)
  },

  LeftHand: {
    minX: deg2rad(-70),
    maxX: deg2rad(80),
    minY: deg2rad(-20),
    maxY: deg2rad(30),
    minZ: deg2rad(-30),
    maxZ: deg2rad(30)
  },

  RightHand: {
    minX: deg2rad(-70),
    maxX: deg2rad(80),
    minY: deg2rad(-30),
    maxY: deg2rad(20),
    minZ: deg2rad(-30),
    maxZ: deg2rad(30)
  },

  LeftUpLeg: {
    minX: deg2rad(-30),
    maxX: deg2rad(120),
    minY: deg2rad(-30),
    maxY: deg2rad(45),
    minZ: deg2rad(-45),
    maxZ: deg2rad(45)
  },

  RightUpLeg: {
    minX: deg2rad(-30),
    maxX: deg2rad(120),
    minY: deg2rad(-45),
    maxY: deg2rad(30),
    minZ: deg2rad(-45),
    maxZ: deg2rad(45)
  },

  LeftLeg: {
    minX: null,
    maxX: null,
    minY: deg2rad(0),
    maxY: deg2rad(145),
    minZ: null,
    maxZ: null
  },

  RightLeg: {
    minX: null,
    maxX: null,
    minY: deg2rad(-145),
    maxY: deg2rad(0),
    minZ: null,
    maxZ: null
  },

  LeftFoot: {
    minX: deg2rad(-45),
    maxX: deg2rad(20),
    minY: deg2rad(-20),
    maxY: deg2rad(20),
    minZ: deg2rad(-15),
    maxZ: deg2rad(15)
  },

  RightFoot: {
    minX: deg2rad(-45),
    maxX: deg2rad(20),
    minY: deg2rad(-20),
    maxY: deg2rad(20),
    minZ: deg2rad(-15),
    maxZ: deg2rad(15)
  },

  LeftHandThumb1: {
    minX: deg2rad(-20),
    maxX: deg2rad(60),
    minY: deg2rad(-30),
    maxY: deg2rad(30),
    minZ: deg2rad(-45),
    maxZ: deg2rad(45)
  },

  LeftHandThumb2: {
    minX: deg2rad(0),
    maxX: deg2rad(80),
    minY: deg2rad(-10),
    maxY: deg2rad(10),
    minZ: deg2rad(-10),
    maxZ: deg2rad(10)
  },

  LeftHandThumb3: {
    minX: deg2rad(0),
    maxX: deg2rad(90),
    minY: deg2rad(-5),
    maxY: deg2rad(5),
    minZ: deg2rad(-5),
    maxZ: deg2rad(5)
  },

  LeftHandIndex1: {
    minX: deg2rad(-30),
    maxX: deg2rad(90),
    minY: deg2rad(-20),
    maxY: deg2rad(20),
    minZ: deg2rad(-10),
    maxZ: deg2rad(10)
  },

  LeftHandIndex2: {
    minX: deg2rad(0),
    maxX: deg2rad(110),
    minY: deg2rad(-5),
    maxY: deg2rad(5),
    minZ: deg2rad(-5),
    maxZ: deg2rad(5)
  },

  LeftHandIndex3: {
    minX: deg2rad(0),
    maxX: deg2rad(90),
    minY: deg2rad(-5),
    maxY: deg2rad(5),
    minZ: deg2rad(-5),
    maxZ: deg2rad(5)
  }
}

const leftHandFingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
leftHandFingers.forEach(finger => {
  for (let i = 1; i <= 3; i++) {
    const leftKey = `LeftHand${finger}${i}`
    const rightKey = `RightHand${finger}${i}`
    if (JOINT_LIMITS[leftKey]) {
      JOINT_LIMITS[rightKey] = { ...JOINT_LIMITS[leftKey] }
    }
  }
})

export function clampRotation(value: number, min: number | null, max: number | null): number {
  if (min !== null && value < min) return min
  if (max !== null && value > max) return max
  return value
}

export function applyJointLimits(boneName: string, rotation: THREE.Euler): void {

  let limit: JointLimit | undefined

  for (const [key, value] of Object.entries(JOINT_LIMITS)) {
    if (boneName.endsWith(key)) {
      limit = value
      break
    }
  }

  if (!limit) return

  rotation.x = clampRotation(rotation.x, limit.minX, limit.maxX)
  rotation.y = clampRotation(rotation.y, limit.minY, limit.maxY)
  rotation.z = clampRotation(rotation.z, limit.minZ, limit.maxZ)
}

export function hasJointLimits(boneName: string): boolean {
  return Object.keys(JOINT_LIMITS).some(key => boneName.endsWith(key))
}
