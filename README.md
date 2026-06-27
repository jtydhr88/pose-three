# pose-three

3D human pose editor engine for [Three.js](https://threejs.org). IK/FK posing with a
CCD solver, a pose-library loader, and one-click export of **OpenPose / depth / normal**
maps — ready to feed AI image models (ControlNet) as reference.

Headless engine extracted from the *free-pose-editor* app: no Vue, no DOM framework,
just classes that take Three.js objects.

## Install

```bash
npm install pose-three three
```

`three >= 0.160` is a peer dependency.

## Quickstart

```ts
import { PoseEditor } from 'pose-three'

// Mounts a full renderer into the container element (by id).
const editor = new PoseEditor('canvas-host')

// Load a rigged Mixamo-style FBX (must include OpenPose helper bones).
editor.loadModel('/models/mannequin.fbx')

// Pose it in the viewport (drag IK end-effectors, rotate FK joints), then:
await editor.exportOpenPose(true)   // OpenPose skeleton (+hands) → PNG
await editor.exportDepthMap()       // depth map → PNG
await editor.exportNormalMap()      // normal map → PNG
```

### Lower-level building blocks

The engine ships its parts so you can compose your own editor:

- `PosingModel` — bone detection, IK/FK controller generation, pose apply/serialize, hand mirroring
- `CCDIKSolver` — cyclic-coordinate-descent IK
- `DragControls` — plane-projected end-effector dragging
- `ExportManager` — OpenPose / depth / normal / regular render export
- `JSONPoseLoader` — load/apply pose & hand-pose JSON
- `OpenPoseConverter` — import OpenPose JSON back into a 3D pose
- `PoseSerializer` / `PoseLibrary` — rich pose format + browser library
- `JointLimits` — per-bone rotation limits

## Playground

```bash
npm install
npm run dev          # interactive demo (playground/)
```

## Build

```bash
npm run build        # → dist/ (es + cjs + d.ts)
```

## License

MIT
