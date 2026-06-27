import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { PosingModel } from './PosingModel'
import { DragControls } from './DragControls'
import { ExportManager } from './ExportManager'
import { PoseSerializer, PoseLibrary } from './PoseSerializer'
import { JSONPoseLoader } from './JSONPoseLoader'
import type { CCDIKSolver } from './CCDIKSolver'
import type { ModelConfig, PoseController } from './types'
import { isFKController, isIKController, isRootController } from './types'

type CameraView = 'main' | 'secondary'
type TransformMode = 'rotate' | 'translate'

type TransformControlsCompat = TransformControls & {
  visible: boolean
  _root: THREE.Object3D
}

export class PoseEditor {
  private container: HTMLElement
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private secondaryCamera!: THREE.PerspectiveCamera
  private cameraHelper!: THREE.CameraHelper
  private activeCamera: CameraView = 'main'
  private renderer!: THREE.WebGLRenderer
  private orbitControls!: OrbitControls
  private transformControls!: TransformControlsCompat
  private dragControls!: DragControls
  private cameraTransformControls!: TransformControlsCompat

  private ground!: THREE.Mesh
  private gridHelper!: THREE.GridHelper

  public posingModel: PosingModel | null = null
  private currentIKSolver: CCDIKSolver | null = null

  private exportManager!: ExportManager
  private poseSerializer: PoseSerializer
  private poseLibrary: PoseLibrary
  private jsonPoseLoader: JSONPoseLoader

  private raycaster: THREE.Raycaster
  private mouse: THREE.Vector2

  private isTransformControlActive = false
  private isDragControlActive = false
  private isIKEnabled = true
  private isFKEnabled = false
  private transformMode: TransformMode = 'rotate'

  private hoveredController: PoseController | null = null
  private originalHoverColor: number | null = null
  private originalHoverOpacity: number | null = null

  private selectedController: PoseController | null = null

  private currentModelPath = '../assets/models/realistic_muscular_male_OP_IK.fbx'

  constructor(containerId: string) {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`)
    }
    this.container = container

    this.poseSerializer = new PoseSerializer()
    this.poseLibrary = new PoseLibrary()
    this.jsonPoseLoader = new JSONPoseLoader()
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    this._init()
    this._animate()
  }

  private _init(): void {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x222222)

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000)
    this.camera.position.set(0, 100, 200)

    this.secondaryCamera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.secondaryCamera.position.set(100, 80, 100)
    this.secondaryCamera.lookAt(0, 50, 0)
    this.scene.add(this.secondaryCamera)

    this.cameraHelper = new THREE.CameraHelper(this.secondaryCamera)
    this.cameraHelper.visible = true
    this.scene.add(this.cameraHelper)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.container.appendChild(this.renderer.domElement)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 100, 50)
    directionalLight.castShadow = true
    this.scene.add(directionalLight)

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
    directionalLight2.position.set(-50, 50, -50)
    this.scene.add(directionalLight2)

    const groundGeometry = new THREE.PlaneGeometry(500, 500)
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.scene.add(this.ground)

    this.gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x444444)
    this.scene.add(this.gridHelper)

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbitControls.target.set(0, 50, 0)
    this.orbitControls.enableDamping = true
    this.orbitControls.dampingFactor = 0.05
    this.orbitControls.update()

    this.transformControls = new TransformControls(
      this.camera,
      this.renderer.domElement
    ) as TransformControlsCompat
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !event.value
      this.isTransformControlActive = Boolean(event.value)
    })

    this.transformControls.addEventListener('objectChange', () => {
      if (!this.posingModel) return
      const controller = this.selectedController
      if (!controller || !isRootController(controller)) return

      const mesh = this.posingModel.mesh
      const offset = controller.userData.meshOffset as THREE.Vector3

      const rotatedOffset = offset.clone()
      rotatedOffset.applyQuaternion(controller.quaternion)

      mesh.position.copy(controller.position).sub(rotatedOffset)
      mesh.quaternion.copy(controller.quaternion)
      mesh.scale.copy(controller.scale)
    })

    this.transformControls.setMode(this.transformMode)
    this.transformControls.setSpace('local')
    this.transformControls.setSize(0.5)

    this.scene.add(this.transformControls._root)

    this.cameraTransformControls = new TransformControls(
      this.camera,
      this.renderer.domElement
    ) as TransformControlsCompat
    this.cameraTransformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !event.value
    })
    this.cameraTransformControls.addEventListener('objectChange', () => {
      this.cameraHelper.update()
    })
    this.cameraTransformControls.setSize(0.8)
    this.cameraTransformControls.attach(this.secondaryCamera)
    this.cameraTransformControls.visible = true
    this.scene.add(this.cameraTransformControls._root)

    this.dragControls = new DragControls(this.camera, this.renderer.domElement)

    this.exportManager = new ExportManager(this.scene, this.camera, this.renderer)

    this.dragControls.addEventListener('dragstart', () => {
      this.isDragControlActive = true
      this.orbitControls.enabled = false
    })

    this.dragControls.addEventListener('drag', () => {
      if (this.currentIKSolver) {
        this.currentIKSolver.update()
      }
    })

    this.dragControls.addEventListener('dragend', () => {
      this.isDragControlActive = false
      this.orbitControls.enabled = true
      this.currentIKSolver = null
    })

    window.addEventListener('resize', () => this._onWindowResize(), false)
    this.renderer.domElement.addEventListener('pointerdown', (e) => this._onPointerDown(e), false)
    this.renderer.domElement.addEventListener('pointermove', (e) => this._onPointerMove(e), false)
  }

  public loadModel(modelPath?: string): void {
    const loader = new FBXLoader()
    const path = modelPath || this.currentModelPath

    console.log('Loading model:', path)

    loader.load(
      path,
      (fbx) => {
        this._onModelLoaded(fbx)
        this.currentModelPath = path
      },
      (progress) => {
        console.log('Loading model:', ((progress.loaded / progress.total) * 100).toFixed(2) + '%')
      },
      (error) => {
        console.error('Error loading model:', error)
        alert(`Failed to load model: ${path}\nPlease check that the FBX file exists.`)
      }
    )
  }

  private _onModelLoaded(fbx: THREE.Group): void {
    console.log('========== MODEL LOADED ==========')
    console.log('FBX model name:', fbx.name)
    console.log('Model path:', this.currentModelPath)

    fbx.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false
      }
    })

    fbx.position.set(0, 0, 0)
    this.scene.add(fbx)

    const modelConfig: ModelConfig = {
      boneSize: 1.5,
      handBoneSize: 0.5,
      hipBoneSize: 2,
      hipBoneName: 'Hips',
    }

    console.log('Creating PosingModel with config:', modelConfig)
    this.posingModel = new PosingModel(fbx, modelConfig)

    this.posingModel.showIKControllers(this.isIKEnabled)
    this.posingModel.showFKControllers(this.isFKEnabled)

    const ikControllers = this.posingModel.boneControllers.filter(
      (c) => c.name === 'BoneControllerIK'
    ).length
    const fkControllers = this.posingModel.boneControllers.filter(
      (c) => c.name === 'BoneController'
    ).length

    console.log('========== MODEL READY ==========')
    console.log('Total controllers:', this.posingModel.boneControllers.length)
    console.log('  - IK controllers:', ikControllers)
    console.log('  - FK controllers:', fkControllers)
    console.log('=================================')
  }

  private _onPointerMove(event: PointerEvent): void {
    if (this.isTransformControlActive) {
      return
    }

    if (this.isDragControlActive) {
      return
    }

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    if (!this.posingModel) return

    const visibleControllers: PoseController[] = this.posingModel.boneControllers.filter(
      (c) => c.visible
    )

    if (this.posingModel.modelRootController && this.posingModel.modelRootController.visible) {
      visibleControllers.push(this.posingModel.modelRootController)
    }

    if (visibleControllers.length === 0) {
      this._clearHover()
      return
    }

    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(visibleControllers, false)

    if (intersects.length > 0) {
      const controller = intersects[0].object as PoseController

      if (this.hoveredController !== controller) {
        this._clearHover()
        this._setHover(controller)
      }
    } else {
      this._clearHover()
    }
  }

  private _setHover(controller: PoseController): void {
    this.hoveredController = controller
    this.originalHoverColor = controller.material.color.getHex()
    this.originalHoverOpacity = controller.material.opacity

    controller.material.color.setHex(0xff3300)
    controller.material.opacity = 0.8

    this.renderer.domElement.style.cursor = 'pointer'
  }

  private _clearHover(): void {
    if (this.hoveredController) {
      this.hoveredController.material.color.setHex(this.originalHoverColor!)
      this.hoveredController.material.opacity = this.originalHoverOpacity!
      this.hoveredController = null
    }

    this.renderer.domElement.style.cursor = 'default'
  }

  private _onPointerDown(event: PointerEvent): void {
    if (this.isTransformControlActive || this.isDragControlActive) {
      return
    }

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    if (!this.posingModel) return

    const visibleControllers: PoseController[] = this.posingModel.boneControllers.filter(
      (c) => c.visible
    )

    if (this.posingModel.modelRootController && this.posingModel.modelRootController.visible) {
      visibleControllers.push(this.posingModel.modelRootController)
    }

    if (visibleControllers.length === 0) return

    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(visibleControllers, false)

    if (intersects.length > 0) {
      intersects.sort((a, b) => a.distance - b.distance)

      let selected: THREE.Object3D = intersects[0].object

      if (
        intersects.length >= 2 &&
        intersects[0].object.name === 'BoneControllerIK' &&
        intersects[1].object.name === 'BoneController'
      ) {
        selected = intersects[1].object
      }

      if (isFKController(selected)) {
        this.transformControls.detach()
        if (selected.parent) this.transformControls.attach(selected.parent)

        this._setTransformMode('rotate')
        this.transformControls.setSpace('local')
        this.transformControls.visible = true

        this.selectedController = selected
        if (this.hoveredController !== selected) {
          this._clearHover()
          this._setHover(selected)
        }
      } else if (isRootController(selected)) {
        this.transformControls.detach()
        this.transformControls.attach(selected)

        this.transformControls.setSpace('world')
        this.transformControls.visible = true

        this.selectedController = selected
        if (this.hoveredController !== selected) {
          this._clearHover()
          this._setHover(selected)
        }
      } else if (isIKController(selected)) {
        const worldPos = new THREE.Vector3()
        selected.effectorBone.getWorldPosition(worldPos)
        if (selected.targetBone.parent) {
          selected.targetBone.position.copy(selected.targetBone.parent.worldToLocal(worldPos))
        }
        selected.targetBone.updateMatrixWorld(true)

        this.selectedController = selected
        if (this.hoveredController !== selected) {
          this._clearHover()
          this._setHover(selected)
        }

        this.currentIKSolver = selected.ikSolver
        this.dragControls.startDragging(selected.targetBone, event)
        this.transformControls.detach()
      }
    } else {
      this.transformControls.detach()
      this.selectedController = null
    }
  }

  public setTransformMode(mode: TransformMode): void {
    this._setTransformMode(mode)
  }

  private _setTransformMode(mode: TransformMode): void {
    this.transformMode = mode
    this.transformControls.setMode(mode)
    this.cameraTransformControls.setMode(mode)
  }

  private _onWindowResize(): void {
    const aspect = window.innerWidth / window.innerHeight
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    this.secondaryCamera.aspect = aspect
    this.secondaryCamera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.cameraHelper.update()
  }

  private _animate(): void {
    requestAnimationFrame(() => this._animate())

    if (this.currentIKSolver) {
      this.currentIKSolver.update()
    }

    this.orbitControls.update()

    this.cameraHelper.update()

    const currentCamera = this.activeCamera === 'main' ? this.camera : this.secondaryCamera

    if (this.activeCamera === 'secondary') {
      this.cameraHelper.visible = false
      this.cameraTransformControls.visible = false
    }

    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight)
    this.renderer.setScissor(0, 0, window.innerWidth, window.innerHeight)
    this.renderer.setScissorTest(false)
    this.renderer.render(this.scene, currentCamera)

    if (this.activeCamera === 'main') {
      const previewWidth = 300
      const previewHeight = 200
      const margin = 10

      this.renderer.setViewport(
        window.innerWidth - previewWidth - margin,
        margin,
        previewWidth,
        previewHeight
      )
      this.renderer.setScissor(
        window.innerWidth - previewWidth - margin,
        margin,
        previewWidth,
        previewHeight
      )
      this.renderer.setScissorTest(true)

      const cameraHelperVisible = this.cameraHelper.visible
      const transformControlsVisible = this.transformControls.visible
      const cameraTransformControlsRootVisible = this.cameraTransformControls._root.visible

      this.cameraHelper.visible = false
      this.transformControls.visible = false
      this.cameraTransformControls._root.visible = false

      this.renderer.render(this.scene, this.secondaryCamera)

      this.cameraHelper.visible = cameraHelperVisible
      this.transformControls.visible = transformControlsVisible
      this.cameraTransformControls._root.visible = cameraTransformControlsRootVisible

      this.renderer.setScissorTest(false)
    }
  }

  public resetPose(): void {
    if (this.posingModel) {
      this.posingModel.resetPose()
      this.transformControls.detach()
    }
  }

  public resetSelectedBone(): void {
    if (!this.posingModel) return

    if (this.selectedController && isFKController(this.selectedController)) {
      const bone = this.selectedController.parent
      if (bone && (bone as THREE.Bone).isBone) {
        this.posingModel.resetBone(bone as THREE.Bone)
        console.log('Reset selected bone:', bone.name)
      }
    } else {
      console.log('No FK bone selected. Please select a bone controller first.')
    }
  }

  public showIKControllers(show: boolean): void {
    this.isIKEnabled = show
    if (this.posingModel) {
      this.posingModel.showIKControllers(show)
    }

    if (!show && !this.isFKEnabled) {
      this.transformControls.detach()
    }
  }

  public showFKControllers(show: boolean): void {
    this.isFKEnabled = show
    if (this.posingModel) {
      this.posingModel.showFKControllers(show)
    }

    if (!show) {
      this.transformControls.detach()
    }
  }

  public showModelRootController(show: boolean): void {
    if (this.posingModel) {
      this.posingModel.showModelRootController(show)
    }

    if (!show) {
      this.transformControls.detach()
    }
  }

  public switchCamera(cameraType: CameraView): void {
    this.activeCamera = cameraType

    if (cameraType === 'main') {
      this.cameraHelper.visible = true
      this.cameraTransformControls.visible = true
      this.orbitControls.enabled = true
    } else {
      this.cameraHelper.visible = false
      this.cameraTransformControls.visible = false
      this.orbitControls.enabled = false
    }
  }

  public getActiveCamera(): CameraView {
    return this.activeCamera
  }

  public async exportOpenPose(includeHands: boolean): Promise<void> {
    if (!this.posingModel) {
      alert('Please load a model first')
      return
    }

    console.log(`Exporting OpenPose ${includeHands ? 'with hands' : 'without hands'}...`)

    const groundVisible = this.ground.visible
    const gridVisible = this.gridHelper.visible
    this.ground.visible = false
    this.gridHelper.visible = false

    const modelVisible = this.posingModel.mesh.visible
    this.posingModel.mesh.visible = false

    const imageData = await this.exportManager.exportOpenPose(this.posingModel, includeHands, {
      width: 512,
      height: 512,
    })

    this.posingModel.mesh.visible = modelVisible
    this.ground.visible = groundVisible
    this.gridHelper.visible = gridVisible

    this.exportManager.downloadImage(
      imageData,
      `pose-three_OpenPose${includeHands ? '_Hands' : ''}.png`
    )
    console.log('Export complete')
  }

  public async exportDepthMap(): Promise<void> {
    if (!this.posingModel) {
      alert('Please load a model first')
      return
    }

    console.log('Exporting depth map...')

    const groundVisible = this.ground.visible
    const gridVisible = this.gridHelper.visible
    this.ground.visible = false
    this.gridHelper.visible = false

    this.posingModel.showIKControllers(false)
    this.posingModel.showFKControllers(false)

    const imageData = await this.exportManager.exportDepthMap(this.posingModel, [50, 200], {
      width: 512,
      height: 512,
    })

    this.ground.visible = groundVisible
    this.gridHelper.visible = gridVisible
    this.posingModel.showIKControllers(this.isIKEnabled)
    this.posingModel.showFKControllers(this.isFKEnabled)

    this.exportManager.downloadImage(imageData, 'pose-three_Depth.png')
    console.log('Export complete')
  }

  public async exportNormalMap(): Promise<void> {
    if (!this.posingModel) {
      alert('Please load a model first')
      return
    }

    console.log('Exporting normal map...')

    const groundVisible = this.ground.visible
    const gridVisible = this.gridHelper.visible
    this.ground.visible = false
    this.gridHelper.visible = false

    this.posingModel.showIKControllers(false)
    this.posingModel.showFKControllers(false)

    const imageData = await this.exportManager.exportNormalMap(this.posingModel, {
      width: 512,
      height: 512,
    })

    this.ground.visible = groundVisible
    this.gridHelper.visible = gridVisible
    this.posingModel.showIKControllers(this.isIKEnabled)
    this.posingModel.showFKControllers(this.isFKEnabled)

    this.exportManager.downloadImage(imageData, 'pose-three_Normal.png')
    console.log('Export complete')
  }

  public async exportRegularImage(): Promise<void> {
    if (!this.posingModel) {
      alert('Please load a model first')
      return
    }

    console.log('Exporting regular image...')
    const imageData = await this.exportManager.exportRegularImage({ width: 512, height: 512 })
    this.exportManager.downloadImage(imageData, 'pose-three_Regular.png')
    console.log('Export complete')
  }

  public switchModel(modelPath: string): void {
    console.log('Switching to model:', modelPath)

    if (this.posingModel) {
      this.posingModel.dispose()
      this.posingModel = null
    }

    const objectsToRemove: THREE.Object3D[] = []
    this.scene.traverse((object) => {
      if (
        (object as THREE.SkinnedMesh).isSkinnedMesh ||
        (object.parent && (object.parent as THREE.SkinnedMesh).isSkinnedMesh)
      ) {
        let root: THREE.Object3D = object
        while (root.parent && root.parent !== this.scene) {
          root = root.parent
        }
        if (!objectsToRemove.includes(root)) {
          objectsToRemove.push(root)
        }
      }
    })

    objectsToRemove.forEach((obj) => {
      this.scene.remove(obj)

      obj.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat.dispose())
          } else {
            mesh.material.dispose()
          }
        }
      })
    })

    this.transformControls.detach()

    this.camera.position.set(0, 100, 200)
    this.orbitControls.target.set(0, 50, 0)
    this.orbitControls.update()

    this.loadModel(modelPath)

    console.log('Model switched and scene reset')
  }

  public getScene(): THREE.Scene {
    return this.scene
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer
  }

  public getExportManager(): ExportManager {
    return this.exportManager
  }

  public getPoseSerializer(): PoseSerializer {
    return this.poseSerializer
  }

  public getPoseLibrary(): PoseLibrary {
    return this.poseLibrary
  }

  public getJSONPoseLoader(): JSONPoseLoader {
    return this.jsonPoseLoader
  }
}
