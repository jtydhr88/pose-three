import * as THREE from 'three';

export interface OutlineEffectParameters {

    defaultThickness?: number;

    defaultColor?: number[];

    defaultAlpha?: number;
}

interface OutlineParameters {
    thickness?: number;
    color?: number[];
    alpha?: number;
    visible?: boolean;
}

interface OutlineShaderMaterialParameters extends THREE.ShaderMaterialParameters {
    type?: string;
}

interface LegacyMaterialFlags {
    skinning?: boolean;
    morphTargets?: boolean;
    morphNormals?: boolean;
    fog?: boolean;
}

interface OutlineObject3D extends THREE.Object3D {
    isMesh?: boolean;
    isLine?: boolean;
    isTransformControls?: boolean;
    isTransformControlsGizmo?: boolean;
    isTransformControlsPlane?: boolean;
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material | THREE.Material[];
}

interface OutlineScene extends THREE.Scene {
    autoUpdate?: boolean;
}

export class OutlineEffect {
    renderer: THREE.WebGLRenderer;
    enabled: boolean;
    autoClear: boolean;
    cache: Record<string, unknown>;
    removeThresholdCount: number;
    createMaterial: () => THREE.ShaderMaterial;
    originalMaterials: Record<string, THREE.Material | THREE.Material[]>;
    originalOnBeforeRenders: Record<string, unknown>;

    constructor(renderer: THREE.WebGLRenderer, parameters: OutlineEffectParameters = {}) {
        this.renderer = renderer;
        this.enabled = true;
        this.autoClear = true;

        const defaultThickness = parameters.defaultThickness !== undefined ? parameters.defaultThickness : 0.003;
        const defaultColor = parameters.defaultColor !== undefined ? parameters.defaultColor : [0, 0, 0];
        const defaultAlpha = parameters.defaultAlpha !== undefined ? parameters.defaultAlpha : 1.0;

        this.cache = {};
        this.removeThresholdCount = 60;

        const createMaterial = (): THREE.ShaderMaterial => {
            const materialParameters: OutlineShaderMaterialParameters = {
                type: 'OutlineEffect',
                uniforms: {
                    outlineThickness: { value: defaultThickness },
                    outlineColor: { value: new THREE.Color().fromArray(defaultColor) },
                    outlineAlpha: { value: defaultAlpha }
                },
                vertexShader: `
                    #include <common>
                    #include <uv_pars_vertex>
                    #include <displacementmap_pars_vertex>
                    #include <fog_pars_vertex>
                    #include <morphtarget_pars_vertex>
                    #include <skinning_pars_vertex>
                    #include <logdepthbuf_pars_vertex>
                    #include <clipping_planes_pars_vertex>

                    uniform float outlineThickness;

                    vec4 calculateOutline( vec4 pos, vec3 normal, vec4 skinned ) {
                        float thickness = outlineThickness;
                        const float ratio = 1.0;
                        vec4 pos2 = projectionMatrix * modelViewMatrix * vec4( skinned.xyz + normal, 1.0 );
                        vec4 norm = normalize( pos - pos2 );
                        return pos + norm * thickness * pos.w * ratio;
                    }

                    void main() {
                        #include <uv_vertex>
                        #include <beginnormal_vertex>
                        #include <morphnormal_vertex>
                        #include <skinbase_vertex>
                        #include <skinnormal_vertex>
                        #include <begin_vertex>
                        #include <morphtarget_vertex>
                        #include <skinning_vertex>
                        #include <displacementmap_vertex>
                        #include <project_vertex>

                        vec3 outlineNormal = - objectNormal;
                        gl_Position = calculateOutline( gl_Position, outlineNormal, vec4( transformed, 1.0 ) );

                        #include <logdepthbuf_vertex>
                        #include <clipping_planes_vertex>
                        #include <fog_vertex>
                    }
                `,
                fragmentShader: `
                    #include <common>
                    #include <fog_pars_fragment>
                    #include <logdepthbuf_pars_fragment>
                    #include <clipping_planes_pars_fragment>

                    uniform vec3 outlineColor;
                    uniform float outlineAlpha;

                    void main() {
                        #include <clipping_planes_fragment>
                        #include <logdepthbuf_fragment>

                        gl_FragColor = vec4( outlineColor, outlineAlpha );

                        #include <tonemapping_fragment>
                        #include <colorspace_fragment>
                        #include <fog_fragment>
                        #include <premultiplied_alpha_fragment>
                    }
                `,
                side: THREE.BackSide
            };

            return new THREE.ShaderMaterial(materialParameters);
        };

        this.createMaterial = createMaterial;
        this.originalMaterials = {};
        this.originalOnBeforeRenders = {};
    }

    setSize(width: number, height: number): void {
        this.renderer.setSize(width, height);
    }

    setPixelRatio(pixelRatio: number): void {
        this.renderer.setPixelRatio(pixelRatio);
    }

    render(scene: THREE.Scene, camera: THREE.Camera): void {
        if (!this.enabled) {
            this.renderer.render(scene, camera);
            return;
        }

        try {
            const autoClear = this.renderer.autoClear;
            this.renderer.autoClear = this.autoClear;

            this.renderer.render(scene, camera);

            this.renderer.autoClear = autoClear;

            this.renderOutline(scene, camera);
        } catch (error) {
            console.warn('OutlineEffect error, falling back to normal render:', error);

            this.renderer.render(scene, camera);
        }
    }

    renderOutline(scene: THREE.Scene, camera: THREE.Camera): void {
        const outlineScene = scene as OutlineScene;
        const autoClear = this.renderer.autoClear;
        const sceneAutoUpdate = outlineScene.autoUpdate;
        const sceneBackground = scene.background;
        const shadowMapEnabled = this.renderer.shadowMap.enabled;

        outlineScene.autoUpdate = false;
        scene.background = null;
        this.renderer.autoClear = false;
        this.renderer.shadowMap.enabled = false;

        const transformControls: Array<{ control: THREE.Object3D; visible: boolean }> = [];
        scene.traverse((object) => {
            const outlineObject = object as OutlineObject3D;
            if (outlineObject.isTransformControls) {
                transformControls.push({
                    control: object,
                    visible: object.visible
                });
                object.visible = false;
            }
        });

        const objectsToOutline: THREE.Object3D[] = [];
        scene.traverse((object) => {
            const outlineObject = object as OutlineObject3D;
            const parent = object.parent as OutlineObject3D | null;
            if (outlineObject.isMesh && outlineObject.material) {

                if (outlineObject.isTransformControlsGizmo ||
                    outlineObject.isTransformControlsPlane ||
                    (parent && (parent.isTransformControls || parent.isTransformControlsGizmo))) {
                    return;
                }

                if (object.name === 'BoneController' || object.name === 'BoneControllerIK') {
                    return;
                }

                if (object.type === 'GridHelper' || object.type === 'AxesHelper' || outlineObject.isLine) {
                    return;
                }

                objectsToOutline.push(object);
            }
        });

        objectsToOutline.forEach(object => {
            this.replaceMaterialWithOutline(object);
        });

        this.renderer.render(scene, camera);

        objectsToOutline.forEach(object => {
            this.restoreOriginalMaterial(object);
        });

        transformControls.forEach(({ control, visible }) => {
            control.visible = visible;
        });

        outlineScene.autoUpdate = sceneAutoUpdate;
        scene.background = sceneBackground;
        this.renderer.autoClear = autoClear;
        this.renderer.shadowMap.enabled = shadowMapEnabled;
    }

    replaceMaterialWithOutline(object: THREE.Object3D): void {
        const outlineObject = object as OutlineObject3D;

        if (!outlineObject.geometry || !outlineObject.geometry.attributes.normal) {
            return;
        }

        if (!outlineObject.material) {
            return;
        }

        if (outlineObject.isTransformControlsGizmo || outlineObject.isTransformControlsPlane) {
            return;
        }

        const parent = object.parent as OutlineObject3D | null;
        if (parent && (parent.isTransformControls || parent.isTransformControlsGizmo)) {
            return;
        }

        const uuid = object.uuid;

        if (Array.isArray(outlineObject.material)) {
            this.originalMaterials[uuid] = outlineObject.material;
            outlineObject.material = outlineObject.material.map(mat => this.getOutlineMaterial(mat, object));
        } else {
            this.originalMaterials[uuid] = outlineObject.material;
            outlineObject.material = this.getOutlineMaterial(outlineObject.material, object);
        }
    }

    restoreOriginalMaterial(object: THREE.Object3D): void {
        const outlineObject = object as OutlineObject3D;
        const uuid = object.uuid;

        if (this.originalMaterials[uuid]) {
            outlineObject.material = this.originalMaterials[uuid];
            delete this.originalMaterials[uuid];
        }
    }

    getOutlineMaterial(originalMaterial: THREE.Material, _object: THREE.Object3D): THREE.ShaderMaterial {
        const outlineMaterial = this.createMaterial();

        const legacyOriginal = originalMaterial as THREE.Material & LegacyMaterialFlags;
        const legacyOutline = outlineMaterial as THREE.ShaderMaterial & LegacyMaterialFlags;

        legacyOutline.skinning = legacyOriginal.skinning || false;
        legacyOutline.morphTargets = legacyOriginal.morphTargets || false;
        legacyOutline.morphNormals = legacyOriginal.morphNormals || false;
        outlineMaterial.fog = legacyOriginal.fog !== undefined ? legacyOriginal.fog : true;

        const outlineParams: OutlineParameters = originalMaterial.userData?.outlineParameters || {};

        if (outlineParams.visible === false || originalMaterial.visible === false) {
            outlineMaterial.visible = false;
        }

        if (outlineParams.alpha !== undefined) {
            outlineMaterial.uniforms.outlineAlpha.value = outlineParams.alpha;
            outlineMaterial.transparent = outlineParams.alpha < 1.0;
        }

        if (outlineParams.thickness !== undefined) {
            outlineMaterial.uniforms.outlineThickness.value = outlineParams.thickness;
        }

        if (outlineParams.color !== undefined) {
            outlineMaterial.uniforms.outlineColor.value.fromArray(outlineParams.color);
        }

        return outlineMaterial;
    }

    setRenderTarget(renderTarget: THREE.WebGLRenderTarget | null): void {
        this.renderer.setRenderTarget(renderTarget);
    }

    clear(): void {
        this.renderer.clear();
    }
}

export default OutlineEffect;
