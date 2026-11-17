import { generateAndSaveCharacterAssets } from "../lib/proceduralCharacter.js";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  const versions = await sql.query(
    "SELECT cv.id, cv.character_id, cv.version_number, cv.generation_spec, c.name, c.description, c.style FROM character_versions cv JOIN characters c ON cv.character_id = c.id"
  );

  for (const v of versions) {
    console.log("Generating procedural 3D model for:", v.name);
    
    // Normalize palette if it's an object or string
    let palette = v.generation_spec?.palette;
    if (palette && !Array.isArray(palette)) {
      if (typeof palette === "object") {
        palette = Object.values(palette);
      } else {
        palette = [palette];
      }
    }

    const spec = {
      name: v.name,
      description: v.description,
      style: v.style,
      visual_identity: v.generation_spec?.visual_identity || v.description,
      proportions: v.generation_spec?.proportions,
      palette: palette,
      materials: v.generation_spec?.materials
    };

    const assets = await generateAndSaveCharacterAssets({
      characterId: v.character_id,
      versionNumber: v.version_number,
      spec
    });

    console.log("Generated assets for", v.name, ":", assets.glbUrl);

    await sql.query(
      "UPDATE character_versions SET glb_url = $1, preview_url = $2, rig_metadata = $3 WHERE character_id = $4 AND version_number = $5",
      [assets.glbUrl, assets.previewUrl, JSON.stringify(assets.rigMetadata), v.character_id, v.version_number]
    );

    console.log("Updated database successfully for:", v.name);
  }
}

main().catch(console.error);
