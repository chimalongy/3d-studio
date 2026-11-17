import Link from "next/link";
import { getProjects } from "../../lib/data";
import NewProjectForm from "../../components/NewProjectForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectsPage() {
  const projects = await getProjects();
  return <div className="space-y-6"><div><p className="text-sm muted">WORKSPACE</p><h1 className="text-3xl font-bold mt-2">Projects</h1><p className="muted mt-2">Create and manage story-to-video jobs.</p></div>
    <NewProjectForm />
    <div className="space-y-3">{projects.length ? projects.map(p=><Link key={p.id} href={`/projects/${p.id}`} className="panel p-5 flex justify-between items-center hover:border-violet-400/50"><div><div className="font-semibold">{p.name}</div><div className="text-xs muted mt-1">{new Date(p.created_at).toLocaleString()}</div></div><span className="text-xs rounded-full px-3 py-1 bg-slate-800">{p.status}</span></Link>) : <div className="panel p-8 muted text-sm">No projects yet. Create one above.</div>}</div>
  </div>;
}
