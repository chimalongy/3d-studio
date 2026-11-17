import Link from "next/link";
import { getDashboardData } from "../lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const data = await getDashboardData();
  return <div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm muted">WORKSPACE OVERVIEW</p><h1 className="text-3xl font-bold mt-2">Bring your stories to life.</h1><p className="muted mt-2">Build reusable characters and turn ideas into 3D video projects.</p></div><Link className="btn" href="/projects">New project</Link></div>
    <div className="grid sm:grid-cols-3 gap-4">
      {[["Projects",data.projects],["Saved characters",data.characters],["Production jobs",data.jobs]].map(([label,value])=><div className="panel p-5" key={label}><p className="muted text-sm">{label}</p><p className="text-3xl font-semibold mt-3">{value}</p></div>)}
    </div>
    <div className="grid lg:grid-cols-2 gap-5">
      <section className="panel p-6"><div className="text-sm muted">START HERE</div><h2 className="text-xl font-semibold mt-2">Create a character</h2><p className="muted text-sm mt-2 leading-6">Describe a character once, generate a reusable asset, and bring it into multiple projects while preserving versions.</p><Link href="/characters/create" className="btn inline-block mt-5">Open Character Studio</Link></section>
      <section className="panel p-6"><div className="text-sm muted">VIDEO PIPELINE</div><h2 className="text-xl font-semibold mt-2">Generate a video</h2><p className="muted text-sm mt-2 leading-6">Start with a story prompt. Gemini structures the script and scenes; Trigger.dev coordinates Modal production stages.</p><Link href="/projects" className="btn-secondary inline-block mt-5">View projects</Link></section>
    </div>
    <p className="text-xs muted">Connect your database and configure API credentials in Settings to enable generation.</p>
  </div>;
}
