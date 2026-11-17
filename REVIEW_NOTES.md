# 3D Studio update notes

## Changes made

- Kept the procedural GLB as the immediate character preview.
- Moved Hunyuan3D submission and polling into the single durable Trigger.dev `generate-character` task.
- Removed the detached GPU polling promise from the Next.js request and removed the competing procedural Trigger.dev generation that could overwrite the GPU result.
- On GPU success, the Hunyuan3D GLB URL replaces the preview URL. On GPU failure or missing GPU configuration, the existing preview is retained and the version is completed with fallback metadata.
- Reworked automatic skinning to create a shared humanoid skeleton in model-local coordinates, use anatomical region filtering, assign four valid skin influences per vertex, and recalculate inverse bind matrices after parenting the rig.
- Reduced default and action-pose amplitudes to avoid over-bending the auto-rigged mesh.
- Preserved GLBs that already contain skinning and embedded animations.
- Preserved procedural bone-parented mesh hierarchies when present.
- Updated static GLB handling to retain all mesh parts and their source materials/transforms instead of discarding all but the first mesh.
- Added a rig validation script and documentation.

## Validation

- `node --check` passed for changed non-JSX JavaScript modules.
- Python bytecode compilation passed for the Modal service files.
- The rig validation script was added as `npm run test:rigging`, but could not be executed in this environment because dependency installation timed out before `three` was installed.
- A full Next.js production build and browser-level animation review still need to be run in an environment with dependencies installed and a real generated GLB available.

## Rigging limitation

Hunyuan3D currently exports a static mesh. The viewer now creates skin indices, skin weights and a runtime humanoid skeleton for that mesh. This is geometry-based auto-rigging, not a substitute for artist-authored weights or a character-specific rig on unusual/non-humanoid meshes.
