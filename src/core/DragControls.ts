import * as THREE from 'three';

export interface DragControlsEventMap {
    dragstart: { object: THREE.Object3D | null };
    drag: { object: THREE.Object3D | null };
    dragend: { object: THREE.Object3D | null };
}

export class DragControls extends THREE.EventDispatcher<DragControlsEventMap> {
    enabled: boolean;
    transformGroup: boolean;
    activate: () => void;
    deactivate: () => void;
    dispose: () => void;
    getRaycaster: () => THREE.Raycaster;
    startDragging: (object: THREE.Object3D, event: PointerEvent) => void;

    constructor(camera: THREE.Camera, domElement: HTMLElement) {
        super();

        domElement.style.touchAction = 'none';
        if (domElement.parentElement) {
            domElement.parentElement.style.touchAction = 'none';
        }

        this.enabled = true;
        this.transformGroup = false;

        const _plane = new THREE.Plane();
        const _raycaster = new THREE.Raycaster();
        const _mouse = new THREE.Vector2();
        const _offset = new THREE.Vector3();
        const _intersection = new THREE.Vector3();
        const _worldPosition = new THREE.Vector3();
        const _inverseMatrix = new THREE.Matrix4();

        let _selected: THREE.Object3D | null = null;
        const scope = this;

        function activate() {
            domElement.ownerDocument.addEventListener('pointerup', onPointerUp);
        }

        function deactivate() {
            domElement.ownerDocument.removeEventListener('pointerup', onPointerUp);
        }

        function dispose() {
            deactivate();
        }

        function getRaycaster() {
            return _raycaster;
        }

        function getMousePosition(event: PointerEvent | TouchEvent) {
            const rect = domElement.getBoundingClientRect();
            const touch = 'changedTouches' in event ? event.changedTouches[0] : event;

            _mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            _mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        }

        function onPointerMove(event: PointerEvent) {
            if (scope.enabled === false) return;
            if (!_selected) return;

            getMousePosition(event);
            _raycaster.setFromCamera(_mouse, camera);

            if (_raycaster.ray.intersectPlane(_plane, _intersection)) {
                _selected.position.copy(
                    _intersection.sub(_offset).applyMatrix4(_inverseMatrix)
                );
            }

            scope.dispatchEvent({ type: 'drag', object: _selected });
        }

        function onPointerUp() {
            if (scope.enabled === false) return;
            if (!_selected) return;

            scope.dispatchEvent({ type: 'dragend', object: _selected });
            _selected = null;

            domElement.ownerDocument.removeEventListener('pointermove', onPointerMove, false);
        }

        this.startDragging = function(object, event) {
            if (scope.enabled === false) return;

            getMousePosition(event);
            _raycaster.setFromCamera(_mouse, camera);

            _selected = object;

            _plane.setFromNormalAndCoplanarPoint(
                camera.getWorldDirection(_plane.normal),
                _worldPosition.setFromMatrixPosition(object.matrixWorld)
            );

            if (_raycaster.ray.intersectPlane(_plane, _intersection) && object.parent) {
                _inverseMatrix.copy(object.parent.matrixWorld).invert();
                _offset.copy(_intersection).sub(
                    _worldPosition.setFromMatrixPosition(object.matrixWorld)
                );
            }

            scope.dispatchEvent({ type: 'dragstart', object: _selected });
            domElement.ownerDocument.addEventListener('pointermove', onPointerMove, false);
        };

        activate();

        this.activate = activate;
        this.deactivate = deactivate;
        this.dispose = dispose;
        this.getRaycaster = getRaycaster;
    }
}
