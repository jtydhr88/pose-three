import * as THREE from 'three'
import type { IKConfig } from './types'

export class CCDIKSolver {
  mesh: THREE.SkinnedMesh
  iks: IKConfig[]

  constructor(mesh: THREE.SkinnedMesh, iks: IKConfig[] = []) {
    this.mesh = mesh
    this.iks = iks
    this._valid()
  }

  update(): this {
    const iks = this.iks
    for (let i = 0, l = iks.length; i < l; i++) {
      this.updateOne(iks[i])
    }
    return this
  }

  updateOne(ik: IKConfig): this {
    const bones = this.mesh.skeleton.bones

    const effector = bones[ik.effector]
    const target = bones[ik.target]

    const targetPos = new THREE.Vector3()
    targetPos.setFromMatrixPosition(target.matrixWorld)

    const links = ik.links
    const iteration = ik.iteration !== undefined ? ik.iteration : 1

    for (let i = 0; i < iteration; i++) {
      let rotated = false

      for (let j = 0, jl = links.length; j < jl; j++) {
        const link = bones[links[j].index]

        if (links[j].enabled === false) break

        const linkPos = new THREE.Vector3()
        const invLinkRot = new THREE.Quaternion()
        const effectorVec = new THREE.Vector3()
        const targetVec = new THREE.Vector3()

        linkPos.setFromMatrixPosition(link.matrixWorld)
        invLinkRot.setFromRotationMatrix(link.matrixWorld).invert()

        effectorVec.setFromMatrixPosition(effector.matrixWorld)
        effectorVec.sub(linkPos).applyQuaternion(invLinkRot).normalize()

        targetVec.copy(targetPos).sub(linkPos).applyQuaternion(invLinkRot).normalize()

        let angle = targetVec.dot(effectorVec)
        angle = angle > 1.0 ? 1.0 : angle < -1.0 ? -1.0 : angle
        angle = Math.acos(angle)

        if (angle < 1.0e-5) continue

        if (ik.minAngle !== undefined && angle < ik.minAngle) {
          angle = ik.minAngle
        }
        if (ik.maxAngle !== undefined && angle > ik.maxAngle) {
          angle = ik.maxAngle
        }

        const axis = new THREE.Vector3()
        axis.crossVectors(effectorVec, targetVec).normalize()

        const rot = new THREE.Quaternion()
        rot.setFromAxisAngle(axis, angle)
        link.quaternion.multiply(rot)

        const limitation = links[j].limitation
        const rotationMin = links[j].rotationMin
        const rotationMax = links[j].rotationMax

        if (limitation !== undefined) {
          let w = link.quaternion.w
          if (w > 1.0) w = 1.0
          const c = Math.sqrt(1 - w * w)
          link.quaternion.set(limitation.x * c, limitation.y * c, limitation.z * c, w)
        }

        if (rotationMin !== undefined) {
          const v = new THREE.Vector3()
          v.setFromEuler(link.rotation)
          link.rotation.setFromVector3(v.max(rotationMin))
        }

        if (rotationMax !== undefined) {
          const v = new THREE.Vector3()
          v.setFromEuler(link.rotation)
          link.rotation.setFromVector3(v.min(rotationMax))
        }

        link.updateMatrixWorld(true)
        rotated = true
      }

      if (!rotated) break
    }

    return this
  }

  _valid(): void {
    const iks = this.iks
    const bones = this.mesh.skeleton.bones

    for (let i = 0, l = iks.length; i < l; i++) {
      const ik = iks[i]
      const effector = bones[ik.effector]
      const links = ik.links

      let link: THREE.Object3D | null = effector
      for (let j = 0, jl = links.length; j < jl; j++) {
        const parent = bones[links[j].index]
        if (link.parent !== parent) {
          console.warn(
            'THREE.CCDIKSolver: bone ' + link.name + ' is not the child of bone ' + parent.name
          )
        }
        link = parent
      }
    }
  }
}
