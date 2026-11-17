import { notFound } from "next/navigation";
import Link from "next/link";
import { getCharacter } from "../../../lib/data";
import Model3DViewer from "../../../components/Model3DViewer";
import DeleteCharacterButton from "../../../components/DeleteCharacterButton";
import CharacterUpgradePoller from "../../../components/CharacterUpgradePoller";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function renderSpecValue(val) {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
  }
  if (typeof val === "object") {
    return Object.entries(val)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(" · ");
  }
  return String(val);
}

export default async function CharacterPage({ params }) {
  const character = await getCharacter(params.id);
  if (!character) notFound();

  const latestVersion = character.versions?.[0];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-xs text-violet-300 mb-2">
          <Link href="/characters" className="hover:underline">Characters</Link>
          <span>/</span>
          <span>Asset Details</span>
        </div>
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold">{character.name}</h1>
            <p className="text-sm text-violet-300 mt-1 capitalize font-medium">
              Style: {character.style} · Current: v{character.current_version}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {latestVersion?.glb_url && (
              <a
                href={latestVersion.glb_url}
                target="_blank"
                rel="noreferrer"
                className="btn flex items-center gap-2"
              >
                <span>Download 3D Asset (.glb)</span>
              </a>
            )}
            <DeleteCharacterButton
              characterId={character.id}
              characterName={character.name}
              redirectTo="/characters"
              variant="button"
            />
          </div>
        </div>
        <p className="muted mt-3 leading-relaxed max-w-3xl">
          {character.description}
        </p>
      </div>

      {/* Interactive 3D WebGL Model Viewer */}
      {latestVersion?.glb_url && (
        <section className="space-y-3">
          <CharacterUpgradePoller
            characterId={character.id}
            status={latestVersion?.status}
            vertexCount={latestVersion?.rig_metadata?.vertexCount}
          />
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">3D Model Viewport</h2>
            <span className="text-xs text-emerald-400 flex items-center gap-1.5 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/80">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              WebGL Active
            </span>
          </div>
          <Model3DViewer
            glbUrl={latestVersion.glb_url}
            characterName={character.name}
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Character Versions ({character.versions.length})</h2>
        <div className="space-y-4">
          {character.versions.map((v) => (
            <div key={v.id} className="panel p-6 space-y-5">
              <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-4">
                <div>
                  <span className="font-semibold text-lg">Version {v.version_number}</span>
                  <span className="text-xs muted ml-3">
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      v.status === "completed"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : v.status === "failed"
                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {v.status}
                  </span>
                  {v.glb_url && (
                    <a
                      className="text-xs bg-violet-600 hover:bg-violet-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors inline-block"
                      href={v.glb_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open 3D Model (.glb)
                    </a>
                  )}
                </div>
              </div>

              {/* Gemini Generated Technical Spec */}
              {v.generation_spec && Object.keys(v.generation_spec).length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">
                    AI Technical Specification
                  </h3>
                  <div className="grid md:grid-cols-2 gap-3 text-xs">
                    {v.generation_spec.proportions && (
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 font-medium block mb-1">Proportions:</span>
                        <span className="text-slate-200">{renderSpecValue(v.generation_spec.proportions)}</span>
                      </div>
                    )}
                    {v.generation_spec.silhouette && (
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 font-medium block mb-1">Silhouette:</span>
                        <span className="text-slate-200">{renderSpecValue(v.generation_spec.silhouette)}</span>
                      </div>
                    )}
                    {v.generation_spec.topology_requirements && (
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 font-medium block mb-1">Topology Requirements:</span>
                        <span className="text-slate-200">{renderSpecValue(v.generation_spec.topology_requirements)}</span>
                      </div>
                    )}
                    {v.generation_spec.rig_requirements && (
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 font-medium block mb-1">Rig Requirements:</span>
                        <span className="text-slate-200">{renderSpecValue(v.generation_spec.rig_requirements)}</span>
                      </div>
                    )}
                  </div>

                  {v.generation_spec.palette && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <span className="text-xs text-slate-400">Palette:</span>
                      {Array.isArray(v.generation_spec.palette) ? (
                        v.generation_spec.palette.map((color, idx) => (
                          <span
                            key={idx}
                            className="text-xs bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700"
                          >
                            {typeof color === "object" ? renderSpecValue(color) : String(color)}
                          </span>
                        ))
                      ) : typeof v.generation_spec.palette === "object" ? (
                        Object.entries(v.generation_spec.palette).map(([name, hex], idx) => (
                          <span
                            key={idx}
                            className="text-xs bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700"
                          >
                            {name}: {typeof hex === "object" ? renderSpecValue(hex) : String(hex)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-200">{String(v.generation_spec.palette)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Rig / Bones Hierarchy */}
              {v.rig_metadata && v.rig_metadata.bones && (
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">
                      Rig Skeleton: <strong className="text-slate-200">{v.rig_metadata.skeleton || "Standard Biped"}</strong>
                    </span>
                    <span className="text-xs text-slate-400">
                      {v.rig_metadata.bones.length} Bones mapped
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-950/40 rounded-lg border border-slate-800">
                    {v.rig_metadata.bones.map((b, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-mono bg-slate-800/80 text-violet-300 px-2 py-0.5 rounded"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
