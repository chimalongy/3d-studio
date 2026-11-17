import { sqlClient } from "./db.js";
import fs from "fs/promises";
import path from "path";

export async function createProject({ name, prompt = "" }) {
  if (!name?.trim()) throw new Error("Project name is required.");
  const sql = sqlClient();
  const rows = await sql`
    INSERT INTO projects (name, prompt)
    VALUES (${name.trim()}, ${prompt})
    RETURNING *
  `;
  return rows[0];
}

export async function getProjects() {
  return await sqlClient()`SELECT * FROM projects ORDER BY created_at DESC`;
}

export async function getProject(id) {
  const sql = sqlClient();
  const rows = await sql`SELECT * FROM projects WHERE id = ${id}`;
  if (!rows.length) return null;
  const [scripts, scenes, jobs] = await Promise.all([
    sql`SELECT * FROM scripts WHERE project_id = ${id} ORDER BY created_at DESC LIMIT 1`,
    sql`SELECT * FROM scenes WHERE project_id = ${id} ORDER BY scene_number ASC`,
    sql`SELECT * FROM video_jobs WHERE project_id = ${id} ORDER BY created_at DESC`
  ]);
  return {
    ...rows[0],
    script: scripts[0] || null,
    scenes,
    jobs
  };
}

export async function getDashboardData() {
  const sql = sqlClient();
  const [projectsResult, charactersResult, jobsResult] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM projects`,
    sql`SELECT COUNT(*)::int AS count FROM characters`,
    sql`SELECT COUNT(*)::int AS count FROM video_jobs`
  ]);
  return {
    projects: projectsResult[0]?.count ?? 0,
    characters: charactersResult[0]?.count ?? 0,
    jobs: jobsResult[0]?.count ?? 0
  };
}

export async function getCharacters() {
  const sql = sqlClient();
  return await sql`
    SELECT 
      c.*,
      v.status AS latest_status,
      v.glb_url,
      v.preview_url
    FROM characters c
    LEFT JOIN (
      SELECT DISTINCT ON (character_id) 
        character_id, status, glb_url, preview_url, version_number
      FROM character_versions
      ORDER BY character_id, version_number DESC
    ) v ON v.character_id = c.id
    ORDER BY c.updated_at DESC
  `;
}

export async function getCharacter(id) {
  const sql = sqlClient();
  const rows = await sql`SELECT * FROM characters WHERE id = ${id}`;
  if (!rows.length) return null;
  const versions = await sql`
    SELECT * FROM character_versions
    WHERE character_id = ${id}
    ORDER BY version_number DESC
  `;
  return { ...rows[0], versions };
}

export async function createJob({ projectId = null, status = "queued", stage = "queued", triggerRunId = null }) {
  const rows = await sqlClient()`
    INSERT INTO video_jobs (project_id, status, current_stage, trigger_run_id)
    VALUES (${projectId}, ${status}, ${stage}, ${triggerRunId})
    RETURNING *
  `;
  return rows[0];
}

export async function updateJob(id, fields) {
  const sql = sqlClient();
  const status = fields.status ?? null;
  const stage = fields.current_stage ?? null;
  const result = fields.result_url ?? null;
  const triggerRunId = fields.trigger_run_id ?? null;
  const hasError = fields.error !== undefined;
  const errorVal = fields.error ?? null;

  const rows = await sql`
    UPDATE video_jobs
    SET status = COALESCE(${status}, status),
        current_stage = COALESCE(${stage}, current_stage),
        result_url = COALESCE(${result}, result_url),
        trigger_run_id = COALESCE(${triggerRunId}, trigger_run_id),
        error = CASE WHEN ${hasError} THEN ${errorVal} ELSE error END,
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0];
}

export async function getJob(id) {
  const sql = sqlClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let rows;
  if (isUuid) {
    rows = await sql`SELECT * FROM video_jobs WHERE id = ${id} OR trigger_run_id = ${id} LIMIT 1`;
  } else {
    rows = await sql`SELECT * FROM video_jobs WHERE trigger_run_id = ${id} LIMIT 1`;
  }
  if (!rows.length) return null;
  const stages = await sql`
    SELECT * FROM production_stages
    WHERE job_id = ${rows[0].id}
    ORDER BY started_at ASC
  `;
  return { ...rows[0], stages };
}

export async function createCharacterRecord({ name, description, style, spec }) {
  const sql = sqlClient();
  const c = await sql`
    INSERT INTO characters (name, description, style)
    VALUES (${name}, ${description}, ${style})
    RETURNING *
  `;
  const v = await sql`
    INSERT INTO character_versions (character_id, version_number, status, generation_spec)
    VALUES (${c[0].id}, 1, 'queued', ${JSON.stringify(spec)}::jsonb)
    RETURNING *
  `;
  return { character: c[0], version: v[0] };
}

export async function updateCharacterVersion(characterId, versionNumber, patch) {
  const sql = sqlClient();
  await sql`
    UPDATE character_versions
    SET status = COALESCE(${patch.status || null}, status),
        glb_url = COALESCE(${patch.glb_url || null}, glb_url),
        preview_url = COALESCE(${patch.preview_url || null}, preview_url),
        rig_metadata = CASE 
          WHEN ${patch.rig_metadata ? true : false} THEN ${JSON.stringify(patch.rig_metadata || {})}::jsonb 
          ELSE rig_metadata 
        END
    WHERE character_id = ${characterId} AND version_number = ${versionNumber}
  `;
}

export async function saveScript({ projectId, content }) {
  const sql = sqlClient();
  const rows = await sql`
    INSERT INTO scripts (project_id, content)
    VALUES (${projectId}, ${content})
    RETURNING *
  `;
  return rows[0];
}

export async function saveScenes({ projectId, scenes }) {
  const sql = sqlClient();
  const saved = [];
  for (const s of scenes) {
    const rows = await sql`
      INSERT INTO scenes (project_id, scene_number, description, scene_data)
      VALUES (${projectId}, ${s.scene_number || 1}, ${s.description || ""}, ${JSON.stringify(s)}::jsonb)
      ON CONFLICT (project_id, scene_number)
      DO UPDATE SET description = EXCLUDED.description, scene_data = EXCLUDED.scene_data
      RETURNING *
    `;
    saved.push(rows[0]);
  }
  return saved;
}

export async function recordStageStart(jobId, stageKey, inputData = {}) {
  const sql = sqlClient();
  await sql`
    INSERT INTO production_stages (job_id, stage_key, status, input_data, started_at)
    VALUES (${jobId}, ${stageKey}, 'processing', ${JSON.stringify(inputData)}::jsonb, NOW())
    ON CONFLICT (job_id, stage_key)
    DO UPDATE SET status = 'processing', input_data = EXCLUDED.input_data, started_at = NOW(), error = NULL
  `;
}

export async function recordStageComplete(jobId, stageKey, outputData = {}) {
  const sql = sqlClient();
  await sql`
    UPDATE production_stages
    SET status = 'completed', output_data = ${JSON.stringify(outputData)}::jsonb, completed_at = NOW()
    WHERE job_id = ${jobId} AND stage_key = ${stageKey}
  `;
}

export async function recordStageFailed(jobId, stageKey, error) {
  const sql = sqlClient();
  await sql`
    UPDATE production_stages
    SET status = 'failed', error = ${error}, completed_at = NOW()
    WHERE job_id = ${jobId} AND stage_key = ${stageKey}
  `;
}

export async function deleteCharacter(id) {
  if (!id) throw new Error("Character ID is required.");
  const sql = sqlClient();

  // Delete from Neon database (cascades to character_versions automatically)
  await sql`DELETE FROM characters WHERE id = ${id}`;

  // Clean up any local model or preview files in public/models/characters/
  try {
    const modelsDir = path.join(process.cwd(), "public", "models", "characters");
    const files = await fs.readdir(modelsDir);
    for (const file of files) {
      if (file.startsWith(id)) {
        await fs.unlink(path.join(modelsDir, file)).catch(() => {});
      }
    }
  } catch (fileErr) {
    // If directory doesn't exist or file cleanup fails, ignore
  }

  return { success: true, id };
}
