import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { PosingModel } from './PosingModel';
import type { ExportOptions } from './types';
import { OPENPOSE_BONES, OPENPOSE_CONNECTIONS } from './openpose';
import type { OpenPoseMesh } from './openpose';

export class ExportManager {
    scene: THREE.Scene;
    camera: THREE.Camera;
    renderer: THREE.WebGLRenderer;
    openPoseMeshes: OpenPoseMesh[];

    constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.openPoseMeshes = [];
    }

    async exportOpenPose(
        posingModel: PosingModel,
        includeHands = false,
        exportSize: ExportOptions = { width: 512, height: 512 }
    ): Promise<string | null> {
        if (!posingModel || !posingModel.skinnedMeshes.length) {
            console.error('No valid posing model');
            return null;
        }

        const skinnedMesh = posingModel.skinnedMeshes[0];
        const bones = skinnedMesh.skeleton.bones;
        const bonePositions: Record<string, THREE.Vector3> = {};

        bones.forEach(bone => {
            OPENPOSE_BONES.forEach(boneConfig => {
                const [boneName, color, isHandBone] = boneConfig;

                if (!bone.name.endsWith(boneName)) return;
                if (isHandBone && !includeHands) return;

                const radius = isHandBone ? 0.5 : 1.0;
                const renderOrder = isHandBone ? 4 : 3;

                let depthTest = true;
                if ((boneName === 'LeftHand' || boneName === 'RightHand') && !isHandBone) {
                    depthTest = false;
                }

                const geometry = new THREE.SphereGeometry(radius, 16, 16);
                const material = new THREE.MeshBasicMaterial({
                    color: color,
                    depthTest: depthTest,
                    transparent: false
                });

                const sphere = new THREE.Mesh(geometry, material) as OpenPoseMesh;
                const worldPos = new THREE.Vector3();
                bone.getWorldPosition(worldPos);

                sphere.position.copy(worldPos);
                sphere.renderOrder = renderOrder;
                sphere.posingModel = posingModel;

                this.scene.add(sphere);
                this.openPoseMeshes.push(sphere);

                bonePositions[boneName] = worldPos;
            });
        });

        OPENPOSE_CONNECTIONS.forEach(connection => {
            const [bone1Name, bone2Name, color, isHandConnection] = connection;

            if (isHandConnection && !includeHands) return;

            const pos1 = bonePositions[bone1Name];
            const pos2 = bonePositions[bone2Name];

            if (!pos1 || !pos2) return;

            const linewidth = isHandConnection ? 3 : 4;
            const renderOrder = 0;

            const lineMaterial = new LineMaterial({
                color: color,
                linewidth: linewidth,
                worldUnits: true
            });

            lineMaterial.resolution.set(window.innerWidth, window.innerHeight);

            const positions = [
                pos1.x, pos1.y, pos1.z,
                pos2.x, pos2.y, pos2.z
            ];

            const geometry = new LineGeometry();
            geometry.setPositions(positions);

            const line = new Line2(geometry, lineMaterial);
            line.computeLineDistances();
            line.renderOrder = renderOrder;

            this.scene.add(line);
            this.openPoseMeshes.push(line as unknown as OpenPoseMesh);
        });

        const imageData = await this._captureScene(exportSize);

        this.cleanOpenPoseMeshes();

        return imageData;
    }

    async exportDepthMap(
        posingModel: PosingModel,
        depthRange: [number, number] = [50, 200],
        exportSize: ExportOptions = { width: 512, height: 512 }
    ): Promise<string | null> {
        if (!posingModel) {
            console.error('No valid posing model');
            return null;
        }

        const originalMaterials: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = [];
        posingModel.mesh.traverse(child => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && child.name !== 'BoneController' && child.name !== 'BoneControllerIK') {
                originalMaterials.push({ mesh, material: mesh.material });
            }
        });

        this._createDepthMaterials(posingModel, depthRange[0], depthRange[1]);

        const originalClearColor = this.renderer.getClearColor(new THREE.Color());
        const originalClearAlpha = this.renderer.getClearAlpha();
        this.renderer.setClearColor(0x000000, 1.0);

        const imageData = await this._captureScene(exportSize);

        originalMaterials.forEach(({ mesh, material }) => {
            mesh.material = material;
        });

        this.renderer.setClearColor(originalClearColor, originalClearAlpha);

        return imageData;
    }

    async exportNormalMap(
        posingModel: PosingModel,
        exportSize: ExportOptions = { width: 512, height: 512 }
    ): Promise<string | null> {
        if (!posingModel) {
            console.error('No valid posing model');
            return null;
        }

        const originalMaterials: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = [];
        posingModel.mesh.traverse(child => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && child.name !== 'BoneController' && child.name !== 'BoneControllerIK') {
                originalMaterials.push({ mesh, material: mesh.material });
            }
        });

        posingModel.mesh.traverse(child => {
            const mesh = child as THREE.SkinnedMesh;
            if (mesh.isMesh && child.name !== 'BoneController' && child.name !== 'BoneControllerIK') {
                const normalMaterial = new THREE.MeshNormalMaterial({
                    skinning: mesh.isSkinnedMesh,
                    side: THREE.DoubleSide
                } as THREE.MeshNormalMaterialParameters);
                mesh.material = normalMaterial;
            }
        });

        const originalClearColor = this.renderer.getClearColor(new THREE.Color());
        const originalClearAlpha = this.renderer.getClearAlpha();
        this.renderer.setClearColor(0x8080FF, 1.0);

        const imageData = await this._captureScene(exportSize);

        originalMaterials.forEach(({ mesh, material }) => {
            mesh.material = material;
        });

        this.renderer.setClearColor(originalClearColor, originalClearAlpha);

        return imageData;
    }

    async exportRegularImage(
        exportSize: ExportOptions = { width: 512, height: 512 }
    ): Promise<string> {
        return await this._captureScene(exportSize);
    }

    _createDepthMaterials(posingModel: PosingModel, minRange: number, maxRange: number): void {
        posingModel.mesh.traverse(child => {
            const mesh = child as THREE.SkinnedMesh;
            if (mesh.isMesh && child.name !== 'BoneController' && child.name !== 'BoneControllerIK') {
                const depthMaterial = new THREE.MeshDepthMaterial({
                    depthTest: true,
                    depthWrite: true,
                    skinning: mesh.isSkinnedMesh,
                    side: THREE.DoubleSide
                } as THREE.MeshDepthMaterialParameters);

                depthMaterial.onBeforeCompile = (shader) => {
                    shader.uniforms.minRange = { value: minRange };
                    shader.uniforms.maxRange = { value: maxRange };

                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <common>',
                        '#include <common>\nuniform highp float minRange;\nuniform highp float maxRange;'
                    );

                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <common>',
                        '#include <common>\nuniform highp float minRange;\nuniform highp float maxRange;'
                    );

                    shader.vertexShader = shader.vertexShader.replace(
                        'varying vec2 vHighPrecisionZW;',
                        'varying highp vec2 vHighPrecisionZW;'
                    );

                    shader.fragmentShader = shader.fragmentShader.replace(
                        'varying vec2 vHighPrecisionZW;',
                        'varying highp vec2 vHighPrecisionZW;'
                    );

                    shader.vertexShader = shader.vertexShader.replace(
                        'vHighPrecisionZW = gl_Position.zw;',
                        'vHighPrecisionZW = mvPosition.zw;'
                    );

                    shader.fragmentShader = shader.fragmentShader.replace(
                        'float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;',
                        `highp float fragCoordZ = -1.0 * vHighPrecisionZW[0];
                        fragCoordZ = clamp(fragCoordZ, minRange, maxRange);
                        fragCoordZ = (fragCoordZ - minRange) / (maxRange - minRange);`
                    );
                };

                mesh.material = depthMaterial;
            }
        });
    }

    async _captureScene(exportSize: ExportOptions): Promise<string> {

        const currentPixelRatio = this.renderer.getPixelRatio();

        this.renderer.setPixelRatio(1);

        this.renderer.render(this.scene, this.camera);

        const dataURL = this.renderer.domElement.toDataURL('image/png');

        if (exportSize && (exportSize.width || exportSize.height)) {
            const canvas = await this._resizeImage(dataURL, exportSize);
            const resizedDataURL = canvas.toDataURL('image/png');

            this.renderer.setPixelRatio(currentPixelRatio);

            return resizedDataURL;
        }

        this.renderer.setPixelRatio(currentPixelRatio);

        return dataURL;
    }

    async _resizeImage(dataURL: string, size: ExportOptions): Promise<HTMLCanvasElement> {
        return new Promise<HTMLCanvasElement>((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size.width;
                canvas.height = size.height;

                const ctx = canvas.getContext('2d')!;

                const centerX = img.width / 2 - size.width / 2;
                const centerY = img.height / 2 - size.height / 2;

                ctx.drawImage(
                    img,
                    centerX, centerY, size.width, size.height,
                    0, 0, size.width, size.height
                );

                resolve(canvas);
            };
            img.src = dataURL;
        });
    }

    cleanOpenPoseMeshes(): void {
        this.openPoseMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.openPoseMeshes = [];
    }

    downloadImage(dataURL: string | null, filename = 'pose-three.png'): void {
        const link = document.createElement('a');
        link.setAttribute('download', filename);
        link.setAttribute('href', dataURL as string);
        link.click();
    }
}
