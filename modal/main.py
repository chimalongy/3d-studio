from typing import Any
import uuid
import modal

app = modal.App("3d-video-studio")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi>=0.115.0", "pydantic>=2.9.0")
    .add_local_python_source(
        "character_generator",
        "scene_generator",
        "animation_engine",
        "frame_renderer",
        "video_processor",
    )
)

# Durable job store across container invocations
jobs_dict = modal.Dict.from_name("3d-video-studio-jobs", create_if_missing=True)


@app.function(image=image, timeout=3600)
def execute_pipeline_module(job_id: str, module: str, payload: dict[str, Any]):
    """Execute the compute module asynchronously and update durable job state."""
    try:
        from character_generator import generate_character
        from scene_generator import generate_scene
        from animation_engine import animate_scene
        from frame_renderer import render_frames
        from video_processor import process_video

        # Update status to processing
        current = dict(jobs_dict.get(job_id, {}))
        current["status"] = "processing"
        jobs_dict[job_id] = current

        if module == "character_generation":
            result = generate_character(payload.get("spec", payload))
        elif module == "scene_generation":
            result = generate_scene(payload)
        elif module == "animation":
            result = animate_scene(payload)
        elif module == "frame_rendering":
            result = render_frames(payload)
        elif module == "video_processing":
            result = process_video(payload)
        else:
            raise ValueError(f"Unknown module '{module}'")

        current["status"] = "completed"
        current["result"] = result
        current["error"] = None
        jobs_dict[job_id] = current
    except Exception as exc:
        current = dict(jobs_dict.get(job_id, {}))
        current["status"] = "failed"
        current["error"] = str(exc)
        jobs_dict[job_id] = current


@app.function(image=image, timeout=3600)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    web = FastAPI(title="3D Video Studio Modal API")
    local_jobs_fallback: dict[str, dict[str, Any]] = {}

    class SubmitBody(BaseModel):
        input: dict[str, Any] = {}
        callbackMetadata: dict[str, Any] = {}

    def get_job_state(job_id: str) -> dict[str, Any] | None:
        try:
            val = jobs_dict.get(job_id)
            if val is not None:
                return dict(val)
        except Exception:
            pass
        return local_jobs_fallback.get(job_id)

    def set_job_state(job_id: str, state: dict[str, Any]):
        try:
            jobs_dict[job_id] = state
        except Exception:
            pass
        local_jobs_fallback[job_id] = state

    def register_and_spawn_job(module: str, payload: dict[str, Any]) -> dict[str, str]:
        job_id = "job_" + uuid.uuid4().hex
        initial_state = {
            "job_id": job_id,
            "module": module,
            "status": "queued",
            "input": payload,
            "result": None,
            "error": None,
        }
        set_job_state(job_id, initial_state)

        # Trigger background asynchronous processing in Modal
        try:
            execute_pipeline_module.spawn(job_id, module, payload)
        except Exception as e:
            initial_state["status"] = "failed"
            initial_state["error"] = f"Failed to spawn background task: {str(e)}"
            set_job_state(job_id, initial_state)

        return {"job_id": job_id, "status": "queued"}

    @web.get("/health")
    def health():
        return {"ok": True, "service": "3d-video-studio-modal"}

    @web.post("/character-generation")
    def character_generation(body: SubmitBody):
        return register_and_spawn_job("character_generation", body.input)

    @web.post("/scene-generation")
    def scene_generation(body: SubmitBody):
        return register_and_spawn_job("scene_generation", body.input)

    @web.post("/animation")
    def animation(body: SubmitBody):
        return register_and_spawn_job("animation", body.input)

    @web.post("/frame-rendering")
    def frame_rendering(body: SubmitBody):
        return register_and_spawn_job("frame_rendering", body.input)

    @web.post("/video-processing")
    def video_processing(body: SubmitBody):
        return register_and_spawn_job("video_processing", body.input)

    # Status endpoints (supporting both root and module-prefixed paths)
    @web.get("/status/{job_id}")
    @web.get("/{module}/status/{job_id}")
    def status(job_id: str):
        job = get_job_state(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Unknown job ID")
        return job

    return web
