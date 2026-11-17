import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiKey } from "./settings.js";

const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite"
];

function cleanJsonString(raw) {
  if (!raw) return "{}";
  let str = raw.trim();
  if (str.startsWith("```")) {
    str = str.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  return str;
}

export async function generateText(prompt, json = false) {
  let key;
  try {
    key = await getGeminiKey();
  } catch (err) {
    throw new Error("Add a Gemini API key in Settings first: " + err.message);
  }

  const genAI = new GoogleGenerativeAI(key);

  let lastError = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: json ? { responseMimeType: "application/json" } : {}
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      lastError = err;
      const isRetryable =
        err.status === 404 ||
        err.status === 503 ||
        err.status === 429 ||
        err.message?.includes("503") ||
        err.message?.includes("404") ||
        err.message?.includes("demand");
      if (isRetryable) {
        console.warn(`[Gemini] Model ${modelName} unavailable (${err.status || err.message}). Trying next candidate...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Failed to generate content with Gemini.");
}

function createFallbackSpec({ name, description, style }) {
  console.log(`[Gemini] Generating resilient fallback specification for '${name}'`);
  return {
    name,
    style: style || "stylized",
    visual_identity: description,
    proportions: {
      build: "Balanced stylized biped humanoid",
      height: "1.75m",
      head_to_body_ratio: "1:6"
    },
    face: {
      eyes: "Large expressive glowing optical sensors",
      mouth: "Stylized articulated visor plate"
    },
    materials: {
      primary: "Burnished metal plates with edge wear",
      secondary: "Dark composite fabric",
      emissive: "Luminous cyan energy conduits"
    },
    palette: {
      primary: "#2563eb",
      secondary: "#475569",
      accent: "#38bdf8",
      neutral: "#0f172a"
    },
    silhouette: {
      overall: "Recognizable heroic silhouette with distinct shoulder and head contour"
    },
    personality: "Methodical, observant, and determined.",
    rig_requirements: {
      skeleton: "Standard humanoid bipedal rig with IK compatibility"
    },
    topology_requirements: {
      polygon_count: "Optimized game-ready topology under 20k triangles"
    }
  };
}

export async function createCharacterSpec({ name, description, style }) {
  const prompt = `Return valid JSON only. Create a production-oriented 3D character specification for a reusable rigged character asset. Do not claim geometry has been generated. Include name, visual_identity, proportions, face, hair, outfit, materials, palette, silhouette, personality, rig_requirements, topology_requirements, negative_constraints, style. Preserve the description faithfully and avoid changing identity. Style: ${style}. Name: ${name}. Description: ${description}`;
  try {
    const raw = await generateText(prompt, true);
    return JSON.parse(cleanJsonString(raw));
  } catch (err) {
    console.warn(`[Gemini Spec Notice] Could not complete AI spec parse (${err.message}). Using resilient fallback specification.`);
    return createFallbackSpec({ name, description, style });
  }
}

export async function createScriptAndScenes({ prompt }) {
  const script = await generateText(`Write a concise visual story script for a 3D animated short based on: ${prompt}`);
  const scenesRaw = await generateText(`Convert this script into JSON array of scenes. Each item has scene_number, description, camera, environment, characters, action, lighting. Return JSON only. Script: ${script}`, true);
  let scenes;
  try {
    scenes = JSON.parse(cleanJsonString(scenesRaw));
  } catch (err) {
    throw new Error(`Failed to parse scenes JSON from Gemini: ${err.message}. Raw output: ${scenesRaw.slice(0, 200)}`);
  }
  return { script, scenes };
}
