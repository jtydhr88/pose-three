import { PoseEditor } from 'pose-three'

const base = import.meta.env.BASE_URL

const editor = new PoseEditor('canvas-host')

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

editor.loadModel(`${base}models/anime_female.fbx`)

$<HTMLInputElement>('ik').addEventListener('change', (e) =>
  editor.showIKControllers((e.target as HTMLInputElement).checked))
$<HTMLInputElement>('fk').addEventListener('change', (e) =>
  editor.showFKControllers((e.target as HTMLInputElement).checked))
$<HTMLInputElement>('root').addEventListener('change', (e) =>
  editor.showModelRootController((e.target as HTMLInputElement).checked))
$<HTMLInputElement>('rotate').addEventListener('change', () => editor.setTransformMode('rotate'))
$<HTMLInputElement>('translate').addEventListener('change', () => editor.setTransformMode('translate'))
$<HTMLButtonElement>('reset').addEventListener('click', () => editor.resetPose())

$<HTMLButtonElement>('load-pose').addEventListener('click', () => $<HTMLInputElement>('pose-input').click())
$<HTMLInputElement>('pose-input').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!editor.posingModel) { alert('Load a model first'); return }
  const loader = editor.getJSONPoseLoader()
  try {
    const data = await loader.loadFromFile(file)
    loader.applyPoseToModel(data, editor.posingModel)
  } catch (err) {
    alert(`Failed to load pose: ${(err as Error).message}`)
  }
})

$<HTMLButtonElement>('op').addEventListener('click', () => editor.exportOpenPose(false))
$<HTMLButtonElement>('oph').addEventListener('click', () => editor.exportOpenPose(true))
$<HTMLButtonElement>('depth').addEventListener('click', () => editor.exportDepthMap())
$<HTMLButtonElement>('normal').addEventListener('click', () => editor.exportNormalMap())
$<HTMLButtonElement>('regular').addEventListener('click', () => editor.exportRegularImage())
