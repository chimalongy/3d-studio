import { task, logger } from "@trigger.dev/sdk/v3";
import {
  updateJob,
  updateCharacterVersion,
  saveScript,
  saveScenes,
  recordStageStart,
  recordStageComplete,
  recordStageFailed
} from "../../lib/data";
import { getModalEndpoints } from "../../lib/settings";
import { createScriptAndScenes } from "../../lib/gemini";
import { submitHunyuan3DJob, pollHunyuan3DJob } from "../../lib/hunyuan";

async function submitAndWait(baseUrl, payload, label) {
  if (!baseUrl) throw new Error(`Modal endpoint URL for ${label} is not configured in Settings.`);

  const submit = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: payload })
  });

  if (!submit.ok) {
    throw new Error(`${label} submit failed (${submit.status}): ${await submit.text()}`);
  }

  const data = await submit.json();
  if (!data.job_id) return data;

  let statusUrl;
  try {
    const parsed = new URL(baseUrl);
    statusUrl = `${parsed.origin}/status/${data.job_id}`;
  } catch {
    statusUrl = `${baseUrl.replace(/\/+$/, "")}/status/${data.job_id}`;
  }

  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const response = await fetch(statusUrl);
    if (!response.ok) {
      throw new Error(`${label} status check failed: HTTP ${response.status}`);
    }
    const state = await response.json();
    if (state.status === "completed") return state.result || state;
    if (state.status === "failed") throw new Error(state.error || `${label} failed`);
  }

  throw new Error(`${label} timed out after 15 minutes`);
}

export const generateVideo = task({
  id: "generate-video",
  maxDuration: 3600,
  run: async (payload) => {
    const { jobId, projectId, prompt } = payload;
    let currentStage = "script";
    try {
      const endpoints = await getModalEndpoints();

      // Stage 1: Script & Scenes
      currentStage = "script";
      await updateJob(jobId, { status: "processing", current_stage: "script" });
      await recordStageStart(jobId, "script", { prompt });

      const story = await createScriptAndScenes({ prompt });
      if (projectId) {
        await saveScript({ projectId, content: story.script });
        await saveScenes({ projectId, scenes: story.scenes });
      }
      await recordStageComplete(jobId, "script", { sceneCount: story.scenes.length });

      // Stage 2: Scene Generation
      currentStage = "scene_generation";
      await updateJob(jobId, { current_stage: "scene_generation" });
      await recordStageStart(jobId, "scene_generation", { scenesCount: story.scenes.length });
      const scene = await submitAndWait(
        endpoints.scene_generation,
        { projectId, scenes: story.scenes },
        "scene generation"
      );
      await recordStageComplete(jobId, "scene_generation", scene);

      // Stage 3: Animation
      currentStage = "animation";
      await updateJob(jobId, { current_stage: "animation" });
      await recordStageStart(jobId, "animation", { projectId });
      const animation = await submitAndWait(
        endpoints.animation,
        { projectId, scene },
        "animation"
      );
      await recordStageComplete(jobId, "animation", animation);

      // Stage 4: Frame Rendering
      currentStage = "frame_rendering";
      await updateJob(jobId, { current_stage: "frame_rendering" });
      await recordStageStart(jobId, "frame_rendering", { projectId });
      const frames = await submitAndWait(
        endpoints.frame_rendering,
        { projectId, animation },
        "frame rendering"
      );
      await recordStageComplete(jobId, "frame_rendering", frames);

      // Stage 5: Video Processing
      currentStage = "video_processing";
      await updateJob(jobId, { current_stage: "video_processing" });
      await recordStageStart(jobId, "video_processing", { projectId });
      const video = await submitAndWait(
        endpoints.video_processing,
        { projectId, frames },
        "video processing"
      );
      await recordStageComplete(jobId, "video_processing", video);

      const resultUrl = video.videoUrl || video.assetUrl || null;
      await updateJob(jobId, {
        status: "completed",
        current_stage: "completed",
        result_url: resultUrl
      });
      return { ok: true, video };
    } catch (error) {
      logger.error("Video workflow failed", { error: error.message, stage: currentStage });
      await recordStageFailed(jobId, currentStage, error.message);
      await updateJob(jobId, { status: "failed", error: error.message });
      throw error;
    }
  }
});

export const generateCharacter = task({
  id: "generate-character",
  maxDuration: 3600,
  run: async ({ jobId, characterId, versionNumber, spec, fallbackAssets = null }) => {
    let fallback = fallbackAssets;
    let gpuJobId = null;

    try {
      if (jobId) {
        await updateJob(jobId, { status: "processing", current_stage: "hunyuan3d_generation" });
        await recordStageStart(jobId, "hunyuan3d_generation", {
          characterId,
          versionNumber,
          prompt: spec?.visual_identity || spec?.description || ""
        });
      }

      // The procedural preview is generated by the Next.js request and passed
      // into this durable task. Do not regenerate it on the Trigger worker:
      // its local public/ directory is not shared with the web deployment.

      logger.info("Submitting character to Tencent Hunyuan3D", { characterId });
      const submission = await submitHunyuan3DJob({
        prompt: spec?.visual_identity || spec?.description || "Full-body 3D character",
        characterName: spec?.name || "Character",
        style: spec?.style || "stylized"
      });

      let finalAsset = null;
      if (submission?.job_id) {
        gpuJobId = submission.job_id;
        await updateCharacterVersion(characterId, versionNumber, {
          status: "sculpting",
          rig_metadata: {
            ...(fallback?.rigMetadata || {}),
            asset_source: "procedural_preview",
            gpu_status: "processing",
            gpu_job_id: gpuJobId
          }
        });

        // The task is durable and can wait independently of the Next.js request.
        const gpuResult = await pollHunyuan3DJob(gpuJobId, 2400);
        if (gpuResult?.glbUrl || gpuResult?.assetUrl) {
          finalAsset = gpuResult;
        } else {
          throw new Error("Hunyuan3D did not return a completed GLB asset.");
        }
      } else {
        logger.warn("Hunyuan3D endpoint is not configured or submission failed; keeping procedural fallback.", {
          characterId
        });
      }

      if (finalAsset) {
        const finalGlbUrl = finalAsset.glbUrl || finalAsset.assetUrl;
        const finalMetadata = {
          ...(fallback?.rigMetadata || {}),
          ...(finalAsset.rigMetadata || {}),
          asset_source: "hunyuan3d_gpu",
          gpu_status: "completed",
          gpu_job_id: gpuJobId,
          vertexCount: finalAsset.rigMetadata?.vertexCount || finalAsset.vertexCount || null
        };

        await updateCharacterVersion(characterId, versionNumber, {
          status: "completed",
          glb_url: finalGlbUrl,
          rig_metadata: finalMetadata
        });

        if (jobId) {
          await recordStageComplete(jobId, "hunyuan3d_generation", {
            glbUrl: finalGlbUrl,
            gpuJobId,
            assetSource: "hunyuan3d_gpu"
          });
          await updateJob(jobId, {
            status: "completed",
            current_stage: "completed",
            result_url: finalGlbUrl
          });
        }
        return { ok: true, assetSource: "hunyuan3d_gpu", glbUrl: finalGlbUrl };
      }

      // No GPU endpoint: complete cleanly with the procedural preview instead
      // of leaving the character in a permanent "sculpting" state.
      if (!fallback?.glbUrl) {
        throw new Error("Neither Hunyuan3D nor the procedural fallback produced a GLB asset.");
      }

      await updateCharacterVersion(characterId, versionNumber, {
        status: "completed",
        glb_url: fallback.glbUrl,
        preview_url: fallback.previewUrl || null,
        rig_metadata: {
          ...(fallback.rigMetadata || {}),
          asset_source: "procedural_fallback",
          gpu_status: "unavailable"
        }
      });
      if (jobId) {
        await recordStageComplete(jobId, "hunyuan3d_generation", {
          glbUrl: fallback.glbUrl,
          assetSource: "procedural_fallback",
          gpuStatus: "unavailable"
        });
        await updateJob(jobId, {
          status: "completed",
          current_stage: "completed",
          result_url: fallback.glbUrl
        });
      }
      return { ok: true, assetSource: "procedural_fallback", glbUrl: fallback.glbUrl };
    } catch (error) {
      logger.error("Hunyuan3D character workflow failed; retaining preview when available.", {
        error: error.message,
        characterId,
        gpuJobId
      });

      if (fallback?.glbUrl) {
        await updateCharacterVersion(characterId, versionNumber, {
          status: "completed",
          glb_url: fallback.glbUrl,
          preview_url: fallback.previewUrl || null,
          rig_metadata: {
            ...(fallback.rigMetadata || {}),
            asset_source: "procedural_fallback",
            gpu_status: "failed",
            gpu_error: error.message
          }
        });
        if (jobId) {
          await recordStageFailed(jobId, "hunyuan3d_generation", error.message);
          await updateJob(jobId, {
            status: "completed",
            current_stage: "completed",
            result_url: fallback.glbUrl,
            error: `GPU generation failed; procedural preview retained: ${error.message}`
          });
        }
        return { ok: true, assetSource: "procedural_fallback", gpuStatus: "failed", glbUrl: fallback.glbUrl };
      }

      await updateCharacterVersion(characterId, versionNumber, { status: "failed" });
      if (jobId) {
        await recordStageFailed(jobId, "hunyuan3d_generation", error.message);
        await updateJob(jobId, { status: "failed", error: error.message });
      }
      throw error;
    }
  }
});
