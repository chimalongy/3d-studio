import { tasks } from "@trigger.dev/sdk/v3";
import { createJob, updateJob, createCharacterRecord, updateCharacterVersion } from "./data.js";
import { createCharacterSpec } from "./gemini.js";
import { generateAndSaveCharacterAssets } from "./proceduralCharacter.js";

export async function startVideoWorkflow({ projectId, prompt }) {
  if (!projectId || !prompt?.trim()) throw new Error("projectId and prompt are required.");
  const job = await createJob({ projectId, status: "queued", stage: "script" });
  const handle = await tasks.trigger("generate-video", { jobId: job.id, projectId, prompt });
  await updateJob(job.id, { trigger_run_id: handle.id });
  return { jobId: job.id, triggerRunId: handle.id, status: "queued" };
}

export async function startCharacterWorkflow({ name, description, style = "stylized" }) {
  if (!name?.trim() || !description?.trim()) {
    throw new Error("Name and description are required.");
  }

  const spec = await createCharacterSpec({ name, description, style });
  const { character, version } = await createCharacterRecord({ name, description, style, spec });

  // The procedural asset is deliberately only an immediate preview. The
  // Hunyuan3D result is the authoritative final asset when GPU generation succeeds.
  let previewAssets = null;
  try {
    previewAssets = await generateAndSaveCharacterAssets({
      characterId: character.id,
      versionNumber: version.version_number,
      spec
    });
    await updateCharacterVersion(character.id, version.version_number, {
      status: "sculpting",
      glb_url: previewAssets.glbUrl,
      preview_url: previewAssets.previewUrl,
      rig_metadata: {
        ...previewAssets.rigMetadata,
        asset_source: "procedural_preview",
        gpu_status: "queued"
      }
    });
  } catch (error) {
    console.warn("[Character] Procedural preview could not be generated:", error.message);
  }

  const job = await createJob({
    status: "queued",
    stage: "hunyuan3d_generation"
  });

  try {
    // One durable Trigger.dev task owns the entire GPU lifecycle. This prevents
    // a second procedural task from racing the GPU result and overwriting it.
    const handle = await tasks.trigger("generate-character", {
      jobId: job.id,
      characterId: character.id,
      versionNumber: version.version_number,
      spec,
      fallbackAssets: previewAssets
    });
    if (handle?.id) await updateJob(job.id, { trigger_run_id: handle.id });

    return {
      jobId: job.id,
      triggerRunId: handle?.id || null,
      characterId: character.id,
      status: "queued",
      previewAvailable: Boolean(previewAssets)
    };
  } catch (triggerError) {
    console.warn("[Character] Trigger.dev unavailable; retaining procedural preview:", triggerError.message);

    if (previewAssets) {
      await updateCharacterVersion(character.id, version.version_number, {
        status: "completed",
        rig_metadata: {
          ...previewAssets.rigMetadata,
          asset_source: "procedural_fallback",
          gpu_status: "unavailable"
        }
      });
      await updateJob(job.id, {
        status: "completed",
        current_stage: "completed",
        result_url: previewAssets.glbUrl
      });
    } else {
      await updateCharacterVersion(character.id, version.version_number, { status: "failed" });
      await updateJob(job.id, {
        status: "failed",
        current_stage: "failed",
        error: "Character generation could not be started."
      });
    }

    return {
      jobId: job.id,
      triggerRunId: null,
      characterId: character.id,
      status: previewAssets ? "completed" : "failed",
      previewAvailable: Boolean(previewAssets)
    };
  }
}
