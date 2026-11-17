/**
 * Client for Tencent Hunyuan3D GPU Service on Modal
 */

import { getModalEndpoints } from "./settings.js";

async function resolveHunyuanEndpoint() {
  if (process.env.HUNYUAN3D_ENDPOINT) return process.env.HUNYUAN3D_ENDPOINT;
  try {
    const endpoints = await getModalEndpoints();
    return endpoints.character_generation || null;
  } catch {
    return null;
  }
}

export async function submitHunyuan3DJob({ prompt, characterName, style }) {
  const endpoint = await resolveHunyuanEndpoint();
  if (!endpoint) {
    console.warn("[Hunyuan3D] No GPU endpoint configured in HUNYUAN3D_ENDPOINT or Settings.");
    return null;
  }

  const baseUrl = endpoint.replace(/\/+$/, "");
  console.log(`[Hunyuan3D] Submitting prompt to GPU endpoint: ${baseUrl}/generate`);

  try {
    const res = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        character_name: characterName,
        style
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Hunyuan3D] Submission error (${res.status}): ${errText}`);
      return null;
    }

    const data = await res.json();
    console.log(`[Hunyuan3D] GPU job submitted successfully:`, data);
    return data;
  } catch (err) {
    console.warn(`[Hunyuan3D] Network error calling GPU service: ${err.message}`);
    return null;
  }
}

export async function pollHunyuan3DJob(jobId, maxWaitSeconds = 120) {
  const endpoint = await resolveHunyuanEndpoint();
  if (!endpoint || !jobId) return null;

  const baseUrl = endpoint.replace(/\/+$/, "");
  const startTime = Date.now();

  while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
    try {
      const res = await fetch(`${baseUrl}/status/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "completed") {
          return data.result;
        }
        if (data.status === "failed") {
          console.warn(`[Hunyuan3D] GPU job failed: ${data.error}`);
          return null;
        }
      }
    } catch {
      // transient poll error, retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.warn(`[Hunyuan3D] Polling timed out after ${maxWaitSeconds}s`);
  return null;
}

