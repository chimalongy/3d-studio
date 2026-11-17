import { notFound } from "next/navigation";
import { getProject } from "../../../lib/data";
import GenerateVideoForm from "../../../components/GenerateVideoForm";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }) {
  const project = await getProject(params.id);
  if (!project) notFound();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm muted">PROJECT</p>
        <h1 className="text-3xl font-bold mt-2">{project.name}</h1>
        {project.prompt && <p className="muted mt-2">{project.prompt}</p>}
      </div>

      <GenerateVideoForm projectId={project.id} />

      {project.script && (
        <section className="panel p-6 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Generated Script</h2>
            <span className="text-xs muted">
              {new Date(project.script.created_at).toLocaleString()}
            </span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            {project.script.content}
          </div>
        </section>
      )}

      {project.scenes && project.scenes.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Scene Breakdown ({project.scenes.length})</h2>
          <div className="grid gap-3">
            {project.scenes.map((scene) => (
              <div key={scene.id} className="panel p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">Scene {scene.scene_number}</span>
                  <span className="text-xs muted">
                    {new Date(scene.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-slate-300">{scene.description}</p>
                {scene.scene_data && (
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400 mt-2">
                    {scene.scene_data.camera && (
                      <span className="bg-slate-800/80 px-2.5 py-1 rounded-md">
                        Camera: {scene.scene_data.camera}
                      </span>
                    )}
                    {scene.scene_data.lighting && (
                      <span className="bg-slate-800/80 px-2.5 py-1 rounded-md">
                        Light: {scene.scene_data.lighting}
                      </span>
                    )}
                    {scene.scene_data.environment && (
                      <span className="bg-slate-800/80 px-2.5 py-1 rounded-md">
                        Env: {scene.scene_data.environment}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {project.jobs && project.jobs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Production Jobs ({project.jobs.length})</h2>
          <div className="space-y-3">
            {project.jobs.map((job) => (
              <div key={job.id} className="panel p-4 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <div className="font-mono text-xs text-violet-300">{job.id}</div>
                  <div className="text-xs muted mt-1">
                    Stage: <span className="text-slate-200">{job.current_stage}</span> ·{" "}
                    {new Date(job.created_at).toLocaleString()}
                  </div>
                  {job.error && (
                    <div className="text-xs text-rose-400 mt-1">Error: {job.error}</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full ${
                      job.status === "completed"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : job.status === "failed"
                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {job.status}
                  </span>
                  {job.result_url && (
                    <a
                      href={job.result_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-violet-300 underline"
                    >
                      View Output
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
