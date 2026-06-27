import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DragControls } from '../DragControls'

function pointer(type: string, x: number, y: number): any {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })
}

interface Setup {
  controls: DragControls
  domElement: HTMLCanvasElement
  camera: THREE.PerspectiveCamera
  object: THREE.Object3D
  doc: Document
}

function makeSetup(opts: { withParent?: boolean } = {}): Setup {
  const { withParent = true } = opts

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const domElement = document.createElement('canvas')

  domElement.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} } as DOMRect)

  const scene = new THREE.Scene()
  const object: THREE.Object3D = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  )
  if (withParent) {
    const parent = new THREE.Group()
    parent.add(object)
    scene.add(parent)
  }
  scene.updateMatrixWorld(true)

  const controls = new DragControls(camera, domElement)
  return { controls, domElement, camera, object, doc: domElement.ownerDocument }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('construction', () => {
  it('sets defaults and disables touch action on the element', () => {
    const { controls, domElement } = makeSetup()
    expect(controls.enabled).toBe(true)
    expect(controls.transformGroup).toBe(false)
    expect(domElement.style.touchAction).toBe('none')
    controls.dispose()
  })

  it('also disables touch action on the parent element when present', () => {
    const camera = new THREE.PerspectiveCamera()
    const parent = document.createElement('div')
    const canvas = document.createElement('canvas')
    parent.appendChild(canvas)
    const controls = new DragControls(camera, canvas)
    expect(parent.style.touchAction).toBe('none')
    controls.dispose()
  })

  it('exposes a raycaster', () => {
    const { controls } = makeSetup()
    expect(controls.getRaycaster()).toBeInstanceOf(THREE.Raycaster)
    controls.dispose()
  })
})

describe('drag lifecycle', () => {
  it('emits dragstart → drag → dragend and moves the object', () => {
    const { controls, doc, object } = makeSetup()
    const onStart = vi.fn()
    const onDrag = vi.fn()
    const onEnd = vi.fn()
    controls.addEventListener('dragstart', onStart)
    controls.addEventListener('drag', onDrag)
    controls.addEventListener('dragend', onEnd)

    const before = object.position.clone()

    controls.startDragging(object, pointer('pointerdown', 50, 50))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart.mock.calls[0][0].object).toBe(object)

    doc.dispatchEvent(pointer('pointermove', 75, 40))
    expect(onDrag).toHaveBeenCalled()
    expect(object.position.equals(before)).toBe(false)

    doc.dispatchEvent(pointer('pointerup', 75, 40))
    expect(onEnd).toHaveBeenCalledOnce()

    onDrag.mockClear()
    doc.dispatchEvent(pointer('pointermove', 10, 10))
    expect(onDrag).not.toHaveBeenCalled()

    controls.dispose()
  })

  it('still starts a drag on a parentless object (no offset matrix)', () => {
    const { controls, object } = makeSetup({ withParent: false })
    const onStart = vi.fn()
    controls.addEventListener('dragstart', onStart)
    expect(object.parent).toBeNull()
    controls.startDragging(object, pointer('pointerdown', 50, 50))
    expect(onStart).toHaveBeenCalledOnce()
    controls.dispose()
  })

  it('reads clientX/clientY from a TouchEvent-like object', () => {
    const { controls, doc, object } = makeSetup()
    const onStart = vi.fn()
    const onDrag = vi.fn()
    controls.addEventListener('dragstart', onStart)
    controls.addEventListener('drag', onDrag)

    const touchStart: any = { changedTouches: [{ clientX: 50, clientY: 50 }] }
    controls.startDragging(object, touchStart)
    expect(onStart).toHaveBeenCalledOnce()

    const before = object.position.clone()
    doc.dispatchEvent(pointer('pointermove', 30, 70))
    expect(onDrag).toHaveBeenCalled()
    expect(object.position.equals(before)).toBe(false)
    controls.dispose()
  })
})

describe('enabled flag', () => {
  it('startDragging is a no-op when disabled', () => {
    const { controls, object } = makeSetup()
    const onStart = vi.fn()
    controls.addEventListener('dragstart', onStart)
    controls.enabled = false
    controls.startDragging(object, pointer('pointerdown', 50, 50))
    expect(onStart).not.toHaveBeenCalled()
    controls.dispose()
  })

  it('pointermove does nothing once disabled mid-drag', () => {
    const { controls, doc, object } = makeSetup()
    const onDrag = vi.fn()
    controls.addEventListener('drag', onDrag)
    controls.startDragging(object, pointer('pointerdown', 50, 50))
    controls.enabled = false
    doc.dispatchEvent(pointer('pointermove', 75, 75))
    expect(onDrag).not.toHaveBeenCalled()
    controls.dispose()
  })

  it('pointerup does nothing once disabled mid-drag', () => {
    const { controls, doc, object } = makeSetup()
    const onEnd = vi.fn()
    controls.addEventListener('dragend', onEnd)
    controls.startDragging(object, pointer('pointerdown', 50, 50))
    controls.enabled = false
    doc.dispatchEvent(pointer('pointerup', 50, 50))
    expect(onEnd).not.toHaveBeenCalled()
    controls.dispose()
  })

  it('pointerup with no active selection is a no-op', () => {
    const { controls, doc } = makeSetup()
    const onEnd = vi.fn()
    controls.addEventListener('dragend', onEnd)

    doc.dispatchEvent(pointer('pointerup', 50, 50))
    expect(onEnd).not.toHaveBeenCalled()
    controls.dispose()
  })
})

describe('activate / deactivate / dispose', () => {
  it('can be toggled and disposed without throwing', () => {
    const { controls } = makeSetup()
    expect(() => controls.deactivate()).not.toThrow()
    expect(() => controls.activate()).not.toThrow()
    expect(() => controls.dispose()).not.toThrow()
  })

  it('dispose detaches the pointerup listener', () => {
    const { controls, doc, object } = makeSetup()
    const onEnd = vi.fn()
    controls.addEventListener('dragend', onEnd)
    controls.startDragging(object, pointer('pointerdown', 50, 50))
    controls.dispose()
    doc.dispatchEvent(pointer('pointerup', 50, 50))
    expect(onEnd).not.toHaveBeenCalled()
  })
})
