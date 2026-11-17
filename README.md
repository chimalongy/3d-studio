# 3D Video Studio

## Goal

Build an AI-assisted 3D production studio that turns a user's prompt into a story
and scene plan, constructs and animates that scene with Three.js, renders it as a
video, and lets users manage the resulting projects and 3D character assets.
Trigger.dev is intended to orchestrate long-running work, Modal to provide compute,
and FFmpeg to encode rendered frames into MP4.

## What has been achieved

- A Next.js interface for projects, character records, settings, and viewing GLB assets.
- Neon-backed persistence for projects, characters, versions, jobs, and workflow stages.
- Gemini integration for generating scripts, scene breakdowns, and structured character specifications.
- Trigger.dev workflow definitions and Modal endpoint scaffolding for the compute stages.
- Three.js procedural character previews and a GLB viewer that preserves supplied mesh geometry.

This is a runnable foundation, not a finished production video generator. The video
workflow can exercise orchestration when its services are configured, but its current
Modal scene, animation, and rendering modules return placeholder data; the video
processor returns a public sample MP4 rather than a prompt-generated video.

## Intended video pipeline

1. Generate a script and structured scene plan from the prompt.
2. Build the scenes, camera, lighting, and props with Three.js.
3. Animate the scene and render frames deterministically.
4. Encode the frames to MP4 with FFmpeg and store the result.
5. Save the output URL and job status for playback in the app.

The Three.js scene-building, frame-rendering, and real video-encoding steps still
need to be implemented and connected to the workflow.

## Technology foundation

- Next.js App Router + Tailwind UI
- Neon PostgreSQL for durable project, character, job, and endpoint metadata
- Gemini for script, scene, and character-spec generation
- Trigger.dev for durable workflow orchestration
- Modal endpoints for character generation, scene construction, animation, rendering, and FFmpeg processing
- Cloudflare R2-compatible storage configuration for generated assets

> **Important:** this is a runnable application foundation, not a hosted production service. You must supply Neon, Gemini, Trigger.dev and Modal credentials/endpoints, deploy the Modal functions, and connect an actual 3D character-generation provider. Gemini creates structured specifications; it does not create production-ready rigged GLB geometry by itself. The included Modal character endpoint is an integration seam and returns a clear "provider not configured" result until you connect a geometry/rigging engine.

## Requirements
- Node.js 20+
- Python 3.11+ for Modal deployment
- A Neon PostgreSQL database
- Gemini API key
- Trigger.dev account/project
- Modal account (for compute endpoints)

## 1. Install
```bash
cp .env.example .env.local
npm install
```

Generate a 32-byte encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Put the output in `SETTINGS_ENCRYPTION_KEY`.

Set `DATABASE_URL` to your Neon pooled or direct connection string.

## 2. Create the database schema
Run `db/schema.sql` against your Neon database using the Neon SQL editor or `psql`.

## 3. Run the web app
```bash
npm run dev
```
Open http://localhost:3000. Go to Settings and save the Gemini key and Modal endpoint URLs. Secrets are encrypted server-side before they are stored.

## 4. Configure Trigger.dev
Initialize/link the project with the Trigger.dev CLI:
```bash
npx trigger.dev@latest init
```
Set `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_REF` in `.env.local`, then run:
```bash
npm run trigger:dev
```
Deploy the Trigger tasks before expecting production workflow execution. The UI/API reports a clear error if Trigger is not configured.

## 5. Deploy Modal endpoints
Install the Modal CLI locally to deploy; FastAPI and Pydantic are installed in the
Modal container, not in your local environment. These commands install or update
the CLI in your user-level Python environment; no project virtual environment is
needed. Use the same Python installation that provides the `modal` command.
```bash
cd modal
python -m pip install --user --upgrade -r requirements.txt
modal setup
modal deploy main.py
```
Copy the deployed endpoint URLs into the Settings page. The `main.py` file registers independent endpoints. It intentionally keeps the actual generation logic in separate modules.

### Modal endpoint contract
Submit:
```json
{ "input": { "projectId": "..." }, "callbackMetadata": {} }
```
Response:
```json
{ "job_id": "job_...", "status": "queued" }
```
Status:
```json
{ "job_id": "job_...", "status": "completed", "result": { "assetUrl": "..." } }
```
The included example has an in-memory job registry suitable only for local integration testing. Replace it with durable queue/storage (for example Modal Dict + R2) before production. Do not rely on in-memory state across container restarts.

## 6. Workflow sequence
Intended video workflow: Gemini script → Gemini scene breakdown → Three.js scene generation → animation → frame rendering → FFmpeg output → R2 URL. The current Modal scene, animation, and frame-rendering modules are placeholders, and the video processor returns a sample MP4.

Character workflow: description → Gemini structured character spec → character-generation provider or procedural preview → GLB validation → asset URL → Neon character/version records.

Trigger.dev owns orchestration. Neon is the durable source of truth. Modal does compute. Next.js handles user interaction and configuration.

## Security notes
- Never expose Gemini keys or `SETTINGS_ENCRYPTION_KEY` to browser code.
- Keep secrets in server-only environment variables.
- Use HTTPS in production and restrict database access.
- Add authentication/authorization before exposing this app to multiple users. The starter is intentionally single-tenant and does not include login.
- Configure R2 bucket CORS and access policies deliberately. Do not make private assets public unless intended.
- Rotate any key that has been committed or shared.

## Known implementation boundaries
- No actual mesh-generation vendor is bundled. Connect your chosen text/image-to-3D service in `modal/character_generator.py`, then implement rigging/validation/export there.
- The Modal demo registry is in-memory and not production durable.
- The included scene/animation/render/video processors are clearly marked integration stubs. Wire your real Three.js/Blender/FFmpeg pipeline into them.
- The starter does not include authentication, billing, multi-tenant isolation, or a production asset CDN.
- Audio is intentionally outside this version's scope.

## Useful routes
- `/` Dashboard
- `/projects` Projects
- `/characters` Character library
- `/characters/create` Character creation
- `/settings` API keys and Modal endpoint configuration
- `POST /api/generation/start` Start video workflow
- `POST /api/characters/generate` Start character workflow
- `GET /api/jobs/:id` Read job status


## Character asset generation and rigging

Character creation now uses one durable generation task:

1. A lightweight procedural GLB is created immediately as a preview.
2. Trigger.dev owns the Hunyuan3D submission and polling lifecycle.
3. When Hunyuan3D returns a GLB, that URL replaces the preview URL on the character version.
4. If GPU generation is unavailable or fails, the procedural preview is retained and the version is marked complete with fallback metadata. The Next.js request does not run a detached GPU polling loop, and the procedural task no longer races the GPU result.

### GLB viewer

`Model3DViewer` handles rigged and unrigged GLBs without deforming an unrigged mesh:

- **Rigged GLB:** preserves its scene hierarchy, skin weights, bones, materials, and embedded animation clips.
- **Static GLB (including current Hunyuan3D output):** preserves the supplied mesh and materials without guessing skin weights. Camera orbit, pan, and zoom remain available; character pose controls are not shown unless the asset has a supported rig.

Character movement requires a GLB with a real rig or embedded animation. The current Hunyuan3D output is static; automatic rigging or a rigging provider has not been integrated.

### Rigging utility validation

After installing dependencies, run:

```bash
npm run test:rigging
```

This tests the standalone humanoid-rigging utility's skeleton creation, skin-index bounds, normalized weights, and pose reset behavior. The viewer does not apply this utility to static GLBs.
